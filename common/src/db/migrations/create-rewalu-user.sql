-- Create user
INSERT INTO "user" (
    id,
    email,
    created_at,
    next_quota_reset,
    referral_limit
) VALUES (
    gen_random_uuid(),
    'rewalu@gmail.com',
    NOW(),
    NOW() + INTERVAL '1 month',
    5
) RETURNING id;

-- Add credits to the ledger (will be executed after getting the user ID)
-- Replace $1 with the actual user ID from the previous query
INSERT INTO credit_ledger (
    operation_id,
    user_id,
    principal,
    balance,
    type,
    description,
    priority,
    created_at
) VALUES (
    gen_random_uuid(),
    $1, -- This will be replaced with the actual user ID
    1000000, -- 1 million credits
    1000000,
    'bonus',
    'Initial credit allocation',
    1,
    NOW()
);