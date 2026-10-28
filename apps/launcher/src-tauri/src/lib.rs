use aes_gcm::{
    aead::{Aead, Payload},
    Aes256Gcm, KeyInit, Nonce,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, OpenOptions},
    io::{Read, Write},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::Manager;

#[derive(Deserialize)]
pub struct Envelope {
    payload: String,
    signature: String,
}
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Component {
    id: String,
    bytes: u64,
    sha256: String,
    nonce: String,
    tag: String,
}
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct License {
    version: u8,
    license_id: String,
    account_id: String,
    device_id: String,
    book_id: String,
    source: String,
    issued_at: u64,
    expires_at: u64,
    files: Vec<Component>,
}
fn safe_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value
            .bytes()
            .all(|v| v.is_ascii_alphanumeric() || v == b'_' || v == b'-')
}
fn license(envelope: &Envelope, account: &str, device: &str) -> Result<License, String> {
    let key = option_env!("RPGBAY_MANIFEST_PUBLIC_KEY")
        .ok_or("Manifest signing trust root not configured at build time")?;
    let public: [u8; 32] = hex::decode(key)
        .map_err(|_| "Invalid trust root")?
        .try_into()
        .map_err(|_| "Invalid trust root size")?;
    if envelope.payload.len() > 1_000_000 {
        return Err("Manifest too large".into());
    }
    let data = URL_SAFE_NO_PAD
        .decode(&envelope.payload)
        .map_err(|_| "Invalid payload")?;
    let sig = Signature::from_slice(
        &URL_SAFE_NO_PAD
            .decode(&envelope.signature)
            .map_err(|_| "Invalid signature")?,
    )
    .map_err(|_| "Invalid signature size")?;
    VerifyingKey::from_bytes(&public)
        .map_err(|_| "Invalid public key")?
        .verify(&data, &sig)
        .map_err(|_| "Manifest signature failed")?;
    let m: License = serde_json::from_slice(&data).map_err(|_| "Invalid manifest JSON")?;
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "Invalid clock")?
        .as_millis() as u64;
    if m.version != 1
        || m.account_id != account
        || m.device_id != device
        || m.expires_at <= now
        || m.issued_at > now + 60_000
        || m.expires_at <= m.issued_at
        || !safe_id(&m.license_id)
        || !safe_id(&m.book_id)
        || !["purchase", "family"].contains(&m.source.as_str())
    {
        return Err("License invalid or expired".into());
    }
    if m.files.is_empty() || m.files.len() > 1000 {
        return Err("Invalid files".into());
    }
    let mut ids = std::collections::HashSet::new();
    for f in &m.files {
        if !safe_id(&f.id)
            || !ids.insert(&f.id)
            || f.bytes == 0
            || f.bytes > 4_294_967_296
            || hex::decode(&f.sha256).map_or(true, |b| b.len() != 32)
            || hex::decode(&f.nonce).map_or(true, |b| b.len() != 12)
            || hex::decode(&f.tag).map_or(true, |b| b.len() != 16)
        {
            return Err("Invalid file descriptor".into());
        }
    }
    Ok(m)
}
#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn store_key(id: &str, value: Option<&str>) -> Result<String, String> {
    let entry = keyring::Entry::new("com.libbay.rpgbay.offline", id)
        .map_err(|_| "System key storage unavailable")?;
    if let Some(key) = value {
        entry
            .set_password(key)
            .map_err(|_| "System key storage failed")?;
        return Ok(String::new());
    }
    entry
        .get_password()
        .map_err(|_| "Book key unavailable".to_string())
}
#[cfg(any(target_os = "android", target_os = "ios"))]
fn store_key(_: &str, _: Option<&str>) -> Result<String, String> {
    Err("Mobile Keychain/Keystore bridge not implemented; offline disabled".into())
}
fn client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|_| "HTTP initialization failed".into())
}
/// Per-license keys are fetched directly into native code. The webview never receives the key.
fn provision_book_key_impl(
    envelope: Envelope,
    account: String,
    device: String,
    access_token: String,
) -> Result<(), String> {
    let m = license(&envelope, &account, &device)?;
    let origin =
        option_env!("RPGBAY_API_ORIGIN").ok_or("API origin not configured at build time")?;
    let mut url = url::Url::parse(origin).map_err(|_| "Invalid API origin")?;
    if url.scheme() != "https"
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err("HTTPS API origin required".into());
    }
    url.set_path(&format!("/v1/offline/licenses/{}/key", m.license_id));
    #[derive(Deserialize)]
    struct KeyResponse {
        key: String,
    }
    let response = client()?
        .post(url)
        .bearer_auth(access_token)
        .json(&serde_json::json!({"deviceId": device}))
        .send()
        .map_err(|_| "Key provisioning failed")?
        .error_for_status()
        .map_err(|_| "Key authorization refused")?;
    if response.content_length().unwrap_or(0) > 1024 {
        return Err("Invalid key response".into());
    }
    let mut bytes = Vec::new();
    response
        .take(1025)
        .read_to_end(&mut bytes)
        .map_err(|_| "Key response failed")?;
    if bytes.len() > 1024 {
        return Err("Invalid key response size".into());
    }
    let key: KeyResponse = serde_json::from_slice(&bytes).map_err(|_| "Invalid key response")?;
    if hex::decode(&key.key).map_or(true, |v| v.len() != 32) {
        return Err("Invalid key material".into());
    }
    store_key(
        &format!("{}:{}:{}", account, device, m.license_id),
        Some(&key.key),
    )?;
    Ok(())
}
fn download_component_impl(
    app: tauri::AppHandle,
    envelope: Envelope,
    account: String,
    device: String,
    file_id: String,
    signed_url: String,
) -> Result<(), String> {
    static DOWNLOAD_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let _download_guard = DOWNLOAD_LOCK
        .try_lock()
        .map_err(|_| "Another download is active; retry after completion")?;
    let m = license(&envelope, &account, &device)?;
    let f = m
        .files
        .iter()
        .find(|v| v.id == file_id)
        .ok_or("Component not authorized")?;
    let url = url::Url::parse(&signed_url).map_err(|_| "Invalid download URL")?;
    if url.scheme() != "https" || !url.username().is_empty() || url.password().is_some() {
        return Err("HTTPS download required".into());
    }
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|_| "Storage unavailable")?
        .join("offline")
        .join(hex::encode(Sha256::digest(format!(
            "{}:{}",
            account, device
        ))))
        .join(&m.license_id);
    fs::create_dir_all(&dir).map_err(|_| "Cannot create storage")?;
    let partial = dir.join(format!("{}.part", f.id));
    let mut offset = fs::metadata(&partial).map(|m| m.len()).unwrap_or(0);
    if offset > f.bytes {
        fs::remove_file(&partial).map_err(|_| "Invalid partial package")?;
        offset = 0;
    }
    if offset < f.bytes {
        let http = client()?;
        let mut request = http.get(url);
        if offset > 0 {
            request = request.header("Range", format!("bytes={}-", offset));
        }
        let mut response = request.send().map_err(|_| "Download connection failed")?;
        if response.status() == 200 {
            offset = 0;
        } else if response.status() != 206 {
            return Err(format!("Download HTTP {}", response.status().as_u16()));
        }
        if response.status() == 206
            && response
                .headers()
                .get("content-range")
                .and_then(|v| v.to_str().ok())
                != Some(format!("bytes {}-{}/{}", offset, f.bytes - 1, f.bytes).as_str())
        {
            return Err("Invalid Content-Range".into());
        }
        let mut output = OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(offset == 0)
            .append(offset > 0)
            .open(&partial)
            .map_err(|_| "Cannot write download")?;
        let mut buffer = [0u8; 65536];
        loop {
            let n = response
                .read(&mut buffer)
                .map_err(|_| "Download interrupted; resume available")?;
            if n == 0 {
                break;
            }
            if offset + n as u64 > f.bytes {
                return Err("Download size exceeded".into());
            }
            output
                .write_all(&buffer[..n])
                .map_err(|_| "Download write failed")?;
            offset += n as u64;
        }
        output.sync_all().map_err(|_| "Download sync failed")?;
        if offset != f.bytes {
            return Err("Download incomplete; resume available".into());
        }
    }
    let mut input = fs::File::open(&partial).map_err(|_| "Package unavailable")?;
    let mut digest = Sha256::new();
    let mut buffer = [0u8; 65536];
    loop {
        let n = input
            .read(&mut buffer)
            .map_err(|_| "Checksum read failed")?;
        if n == 0 {
            break;
        }
        digest.update(&buffer[..n]);
    }
    if hex::encode(digest.finalize()) != f.sha256 {
        fs::remove_file(&partial).map_err(|_| "Corrupt package cleanup failed")?;
        return Err("Checksum failed".into());
    }
    fs::rename(partial, dir.join(&f.id)).map_err(|_| "Package commit failed")?;
    Ok(())
}
/// Returns one bounded component in memory. Reader must revoke its Blob URL on close.
fn read_component_impl(
    app: tauri::AppHandle,
    envelope: Envelope,
    account: String,
    device: String,
    file_id: String,
) -> Result<Vec<u8>, String> {
    let m = license(&envelope, &account, &device)?;
    let f = m
        .files
        .iter()
        .find(|v| v.id == file_id)
        .ok_or("Component not authorized")?;
    if f.bytes > 32 * 1024 * 1024 {
        return Err(
            "Reader components must be at most 32 MiB; ingest must split large books".into(),
        );
    }
    let path = app
        .path()
        .app_local_data_dir()
        .map_err(|_| "Storage unavailable")?
        .join("offline")
        .join(hex::encode(Sha256::digest(format!(
            "{}:{}",
            account, device
        ))))
        .join(&m.license_id)
        .join(&f.id);
    let mut data = fs::read(path).map_err(|_| "Package unavailable")?;
    if data.len() as u64 != f.bytes || hex::encode(Sha256::digest(&data)) != f.sha256 {
        return Err("Integrity check failed".into());
    }
    let key = hex::decode(store_key(
        &format!("{}:{}:{}", account, device, m.license_id),
        None,
    )?)
    .map_err(|_| "Invalid stored key")?;
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|_| "Invalid key size")?;
    data.extend(hex::decode(&f.tag).map_err(|_| "Invalid tag")?);
    let nonce = hex::decode(&f.nonce).map_err(|_| "Invalid nonce")?;
    let aad = serde_json::to_string(&[&m.license_id, &account, &device, &f.id])
        .map_err(|_| "Invalid license identity")?;
    cipher
        .decrypt(
            Nonce::from_slice(&nonce),
            Payload {
                msg: &data,
                aad: aad.as_bytes(),
            },
        )
        .map_err(|_| "Authenticated decryption failed".into())
}
#[tauri::command]
async fn provision_book_key(
    envelope: Envelope,
    account: String,
    device: String,
    access_token: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        provision_book_key_impl(envelope, account, device, access_token)
    })
    .await
    .map_err(|_| "Provision worker failed")?
}
#[tauri::command]
async fn download_component(
    app: tauri::AppHandle,
    envelope: Envelope,
    account: String,
    device: String,
    file_id: String,
    signed_url: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        download_component_impl(app, envelope, account, device, file_id, signed_url)
    })
    .await
    .map_err(|_| "Download worker failed")?
}
#[tauri::command]
async fn read_component(
    app: tauri::AppHandle,
    envelope: Envelope,
    account: String,
    device: String,
    file_id: String,
) -> Result<Vec<u8>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        read_component_impl(app, envelope, account, device, file_id)
    })
    .await
    .map_err(|_| "Reader worker failed")?
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            provision_book_key,
            download_component,
            read_component
        ])
        .run(tauri::generate_context!())
        .expect("RPG BAY runtime failed");
}
