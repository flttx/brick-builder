# Brick Builder V1 Release Checklist

本清单是发布门，而不是功能 backlog。任何标记为 Blocked 的核心项都必须阻止发布；“环境未提供”不能写成 PASS。

## CI

- [ ] PR Quality：`npm ci`（官方 npm registry）、typecheck、lint、unit、简体中文 UI localization、dependency audit。
- [ ] Engine：Engine/renderer integration 与固定 seed benchmark。
- [ ] Assets：`assets:build:all`、`assets:validate`、determinism、release dry-run。
- [ ] Backend：PostgreSQL 16 service、fresh migration、migration second-run、backend integration、health/readiness。
- [ ] Web：production build、bundle entry gate；Three/Rapier/Authoring/Debug 不进入首屏入口。
- [ ] E2E：Chromium smoke；Release 建议补 Firefox/WebKit app/login/My Builds/editor smoke。
- [ ] Nightly：完整资产构建、100/500/1000/3000/5000 Engine + Browser benchmark、offline/conflict/migration/roundtrip。

## Database migration

- [ ] 从 fresh PostgreSQL 16 执行全部 migration。
- [ ] 再次执行 migration 时识别 `schema_migrations`，不重复应用。
- [ ] 发布遵守 **Expand → Deploy → Contract**；不承诺所有 migration 可简单 down。
- [ ] 不手工建表，不把缺失 `DATABASE_URL` 静默变成测试通过。

## Asset release

- [ ] 版本使用稳定 `vN`（当前基线为 `v1`），Part content hash 不受随机时间影响。
- [ ] 目标布局为 `/assets/packs/<version>/`，Part 文件 immutable。
- [ ] 顺序：Build → Validate → Upload immutable files → Verify 全部文件 → Upload manifest/index → Switch `current.json`。
- [ ] `current.json` 使用短缓存/no-cache；immutable Part 使用 `public, max-age=31536000, immutable`。
- [ ] 完整验证 manifest、parts-index、全部 GLB、全部 thumbnail、content length、hash/path 对齐。
- [ ] 至少一个内部 CC0 LDraw-compatible 标准件完成 parser → normalize → GLB → runtime registry → Editor 路径。
- [ ] 旧 Snapshot 使用 previous/current pack 打开后 Engine、Renderer、Snap 均一致。
- [ ] `assets:release --dry-run --version vN` 输出上传清单与 pointer 变化，不修改 remote。

## Rollback

- [ ] Web rollback 使用上一份应用 artifact，不要求立即回滚数据库。
- [ ] Asset rollback 只把 `current.json` 指回已验证的旧版本，不删除 immutable pack。
- [ ] DB rollback 采用 forward-fix；新 migration 不依赖简单 down。
- [ ] 发布前记录 App、Asset Pack、Snapshot、DB migration 版本。

## Performance

- [ ] Engine benchmark：warmup ≥10、samples ≥50、100/500/1000/3000/5000、Sparse/Dense、P50/P95/P99。
- [ ] Browser benchmark：固定 seed/camera/viewport/quality，warmup 3s、采样 10s，记录 FPS/frame time/draw calls/chunks/instances/triangles/DPR/quality。
- [ ] Desktop 1000 接近稳定 60 FPS；3000 保持可编辑；5000 作为 stress test。
- [ ] Snap P95：Desktop 目标 <2ms；没有真移动端设备时只报告 Desktop。
- [ ] `performance-report.json` 与 `performance-report.md` 记录 browser、OS、viewport、hardware 与 asset pack。
- [ ] 明确区分真实浏览器、viewport emulation、真实移动设备和 Node CPU proxy。

## E2E

- [ ] A～P 产品验收由 Chromium smoke 覆盖；关键路径包含 login/new project/placement/snap/autosave/reload/reopen/conflict/session/offline/precision。
- [ ] Release Smoke：health、login、My Builds、临时 project create/save/reopen/asset load/delete。
- [ ] 生产不创建测试数据时，在 staging 完整执行上述流程。

## Offline

- [ ] 已缓存项目断网可打开、编辑、刷新并恢复本地状态。
- [ ] 联网后同步；冲突保留 local/cloud 选择，不静默覆盖。
- [ ] 登出只清理当前用户的 private draft/cache/index，不清理 public shell/assets。

## Security

- [ ] HttpOnly cookie、生产 Secure、SameSite、Origin validation。
- [ ] project ownership、private thumbnail authenticated read、session expiry、password hash、snapshot size limit。
- [ ] 日志不含 password、session token、完整 project snapshot；Telemetry 不含坐标、缩略图、搜索关键词。
- [ ] Dev Fault Injection / Advanced Debug 仅 development 可见，生产 UI 不暴露。

## Telemetry

- [ ] consent/config 可关闭；anonymous session ID 不包含用户身份信息。
- [ ] 仅允许 fatal/context loss/asset failure/cloud save failure/conflict/performance summary 的白名单字段。
- [ ] 摘要周期 30～60 秒；reporter 失败不影响编辑与本地保存。

## Monitoring

- [ ] 监控 API 5xx、Cloud Save failure、DB latency、Asset 404、Login failure、frontend fatal、WebGL context lost。
- [ ] 结构化请求日志包含 requestId、API error code、status、duration。
- [ ] `/health` 检查服务与 DB；`/readiness` 检查发布所需依赖，响应不返回敏感配置。

## Backup

- [ ] PostgreSQL 已启用并验证 backup / PITR。
- [ ] 记录恢复演练、最近成功时间、保留策略与责任人；不能只假设 managed DB 默认提供。

## Post-deploy smoke

- [ ] Staging：health、login、My Builds、创建临时作品、save、reopen、asset load、删除临时作品。
- [ ] Production：执行有限 smoke，不写入正式用户数据；发现异常立即执行 Web/Asset rollback 评估。

## Release artifact

- [ ] App Version：`0.1.0`（发布前替换为实际版本）。
- [ ] Asset Pack Version：`v1`（由 `current.json` 确认）。
- [ ] Snapshot Version：`1`。
- [ ] DB Migration Version：`001_initial`（由 `schema_migrations` 确认）。
- [ ] 附上 bundle report、performance report、asset verification、E2E report 与审计结果。

## 当前状态

- Code readiness：由 CI workflow 与本地验证决定。
- Staging object storage：若没有真实凭据，标记 **CODE READY / NOT ENVIRONMENT VERIFIED**。
- Real hardware WebGL/mobile GPU：没有设备时标记 **NOT ENVIRONMENT VERIFIED**，不得写 Mobile PASS。
