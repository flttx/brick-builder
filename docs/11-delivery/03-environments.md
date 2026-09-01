# 环境与配置

Staging 必须拥有独立 DB、Storage Prefix、Asset Pack pointer。

Secrets 不进入 Git 或 client bundle。Runtime Part Assets 可公开 CDN；用户私有 Thumbnail 根据产品隐私要求使用 private storage/signed read。

跨域资产需要正确 CORS，避免 Canvas 生成 Thumbnail 时被 taint。
