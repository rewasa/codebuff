-- Create the grant_type enum type if it doesn't exist
DO $$ BEGIN
    CREATE TYPE grant_type AS ENUM ('purchase', 'bonus', 'topup', 'referral', 'credit', 'refund');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Add a temporary column with the new type
ALTER TABLE credit_ledger ADD COLUMN type_new grant_type;

-- Copy data with explicit casting
UPDATE credit_ledger 
SET type_new = type::text::grant_type;

-- Drop the old column and rename the new one
ALTER TABLE credit_ledger DROP COLUMN type;
ALTER TABLE credit_ledger RENAME COLUMN type_new TO type;

-- Add NOT NULL constraint back
ALTER TABLE credit_ledger ALTER COLUMN type SET NOT NULL;