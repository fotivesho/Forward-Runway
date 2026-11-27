-- Your own categories can have their own symbol and color.
alter table app.category_settings add column if not exists icon text check (icon is null or char_length(icon) between 1 and 24);
alter table app.category_settings add column if not exists color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$');
