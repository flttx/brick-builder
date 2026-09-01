# Auth 与 Session

第一版使用 email/username + password，密码采用 Argon2id 或 scrypt。

推荐 Opaque Server Session，Cookie 使用 HttpOnly、Secure(prod)、SameSite=Lax。

允许多设备同时登录；当前设备 logout 只删除当前 session。正式开放前补充 Rate Limit、Password Reset、账号删除流程。
