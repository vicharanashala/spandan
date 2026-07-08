ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users ADD CONSTRAINT users_role_check
    CHECK (role IN ('ADMIN', 'TEACHER', 'STUDENT'));

INSERT INTO users (full_name, email, password_hash, role, account_status)
SELECT 'System Admin', 'admin@spandan.com',
       '$2a$12$LJ3m4ys3Lk0TSwHnbfOMiOXPm1Qlq5Gz0Yq0V3Nq0e1fF2dD3c4eS',
       'ADMIN', 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE role = 'ADMIN');
