/*
  Simplifies the Otp model to match what's actually built:

  - otpType: shrunk from (REGISTRATION | LOGIN | PASSWORD_RESET |
    PHONE_VERIFY) to just PASSWORD_RESET. Confirmed zero existing rows use
    any value — registration and login are plain email+password (no OTP
    step) and there is no phone-verification feature.

  - attemptCount: dropped. otpCode is a 256-bit crypto.randomBytes(32) hex
    token (the password-reset email link), not a guessable numeric code —
    an attempt counter adds no real protection over what the existing
    per-IP rate limiter on /reset-password already provides. Confirmed
    every existing row had attemptCount = 0 (never incremented anywhere).
*/

ALTER TABLE `otps` MODIFY COLUMN `otpType` ENUM('PASSWORD_RESET') NOT NULL;

ALTER TABLE `otps` DROP COLUMN `attemptCount`;
