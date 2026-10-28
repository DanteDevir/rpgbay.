ALTER TABLE upload_intents ADD COLUMN print_job_id uuid REFERENCES print_jobs;
