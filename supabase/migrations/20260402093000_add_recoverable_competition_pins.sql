alter table competitions
  add column if not exists player_pin_ciphertext text,
  add column if not exists admin_pin_ciphertext text;