/*
  Data fix: the Teacher module is intentionally disabled (self-registration
  is already rejected server-side regardless of this setting's value — see
  registerSchema in auth.validator.ts), so the "Allow teacher
  self-registration" admin setting no longer describes real behavior.
  Remove the stored row; it is also gone from settings.service.ts's
  DEFAULTS so it will not be re-created.
*/

DELETE FROM `settings` WHERE `key` = 'users.teacherRegistration';
