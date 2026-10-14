# cat-world-service

《猫爪星球奇遇记》后端服务。NestJS + TypeORM + MySQL，框架保持精简，业务模块按后续需求再加。

## 启动

```bash
cd service
npm install
cp .env.example .env
npm run start:dev
```

端口由环境变量 `PORT` 配置，未设置时默认 `3000`。接口前缀 `/api`。

健康检查：

```bash
curl http://localhost:3000/api/health
```

生成唯一昵称和用户 ID：

```bash
curl -X POST http://localhost:3000/api/user/generate
```

响应 `data` 包含 `user_id`、`name`、`submit_token`。`submit_token` 是 32 字节随机值的 64 位十六进制编码，仅在创建时返回，客户端独立保存在本机。服务器只保存 SHA256，不支持凭公开用户 ID 认领、查询或补发凭证。昵称在中文基础名后追加匿名 ID，不再受 776 个基础名字的数量限制。

提交成绩须带 `Authorization: Bearer <submit_token>`，凭证只能提交对应 `user_id` 的成绩；读排行榜不需要凭证。以下示例中的占位 ID 和凭证须替换为同一次创建响应中的实际值，勿把正式凭证写入日志或公开文档。

提交排行榜成绩：

```bash
# 关卡榜 type=1
curl -X POST http://localhost:3000/api/rank/submit \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <submit_token>' \
  -d '{"user_id":"K7M2P9QX","type":1,"level_count":12,"star_count":36}'

# 无尽榜 type=2
curl -X POST http://localhost:3000/api/rank/submit \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <submit_token>' \
  -d '{"user_id":"K7M2P9QX","type":2,"clear_count":128,"duration_ms":180000}'

# 超萌挑战榜 type=3，按日期存当天最好成绩
curl -X POST http://localhost:3000/api/rank/submit \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <submit_token>' \
  -d '{"user_id":"K7M2P9QX","type":3,"date":"2026-09-09","duration_ms":92000}'
```

上报埋点（批量，单次最多 50 条；未知事件名会被丢弃，不报错）：

```bash
curl -X POST http://localhost:3000/api/track \
  -H 'Content-Type: application/json' \
  -d '{
    "user_id":"K7M2P9QX",
    "session_id":"sess_demo",
    "platform":"h5",
    "app_version":"1.0.0",
    "events":[
      {"event_id":"e1","name":"app_launch","ts":1758350000000,"props":{"is_new_user":true}},
      {"event_id":"e2","name":"level_start","ts":1758350001800,"props":{"mode":"main","level":1}}
    ]
  }'
```

P0 事件名：`app_launch` `loading_finish` `page_view` `level_enter_click` `level_start` `level_end` `level_next` `level_replay` `level_home` `level_go_build` `tutorial_done` `ad_entrance_show` `ad_click` `ad_result` `building_light` `shop_buy`。

`platform` 由客户端按构建目标写入：微信小游戏 `wechat`，H5 `h5`，编辑器预览 `preview`。看板用 `platform=wechat|h5|preview|all` 筛选。

查询埋点看板（只读聚合，不返回玩家进度；默认最近 7 天，最长 31 天。若配置了 `DASHBOARD_TOKEN`，需带 `X-Dashboard-Token`）。可视化页面在仓库 `web/`：`cd web && npm install && npm run dev`，开发环境代理到本服务 `/api`。

```bash
# 一次拉齐总览 / 漏斗 / 关卡 / 广告 / 页面
curl 'http://localhost:3000/api/track/dashboard?from=2026-09-14&to=2026-09-20&platform=all&mode=all'

# 也可分接口拉
curl 'http://localhost:3000/api/track/overview?platform=wechat'
curl 'http://localhost:3000/api/track/overview?platform=h5'
curl 'http://localhost:3000/api/track/funnel?mode=main'
curl 'http://localhost:3000/api/track/levels'
curl 'http://localhost:3000/api/track/ads'
curl 'http://localhost:3000/api/track/pages'
```

查询排行榜：

```bash
# 关卡榜 / 无尽榜：固定返回前 50；当前用户在 50 名外时补到第 51 位
curl 'http://localhost:3000/api/rank/list?type=1&user_id=K7M2P9QX'
curl 'http://localhost:3000/api/rank/list?type=2&user_id=K7M2P9QX'

# 超萌挑战榜必须传 date
curl 'http://localhost:3000/api/rank/list?type=3&date=2026-09-09&user_id=K7M2P9QX'
```

## 数据库

- 类型：MySQL 8
- 库名：`cat_world`
- 表前缀：`cat_world_`
- 用户表：`cat_world_user`（主键、用户 ID、名称）
- 用户提交凭证：`submit_token_hash CHAR(64) NULL`，默认查询不取此列；旧身份迁移后为 NULL。
- 排行榜表：`cat_world_rank`（用户 ID + 榜单类型 + 日期唯一；关卡/无尽日期为空，超萌挑战按天存）
- 埋点表：`cat_world_track_event`（按 `event_id` 去重；只存分析事件，不存玩家进度）
- 连接信息写在 `.env`（参考 `.env.example`）
- 开发期 `DB_SYNC=true`，后续有表结构后再关掉

## 2026-10-14 排行榜缺陷修复与发布顺序

部署前先在已有数据库执行 `npm run migration:run`，新增 nullable `submit_token_hash`。本次只提供迁移文件，未执行线上迁移或部署。迁移不改动已有榜单、用户或玩家本机存档；凭证列已经由开发环境同步创建时，迁移会跳过重复添加。

旧客户端仅持有公开 ID，没有可验证凭证，不能安全继续写入该身份。新客户端发现凭证缺失时创建新匿名身份，再按原规则补报本机保存的成绩；金币、猫咪、关卡和所有本机存档保持不变。旧榜单记录仍保留，可能暂时出现同一设备的新旧匿名记录，不做无法证明归属的合并。先迁移数据库，再发布后端与支持 Bearer 凭证的客户端；后端发布后旧客户端提交会收到 401，但仍可读榜。

前 50 名的 raw JOIN 查询使用 SQL `LIMIT 50`。成绩更新由 MySQL 原子 upsert 完成：先依据旧主分数决定配对字段，再单调更新主分数，无尽消除数和有效时间来自同一局。三榜相同或较差成绩不更新 `updated_at`；连接显式关闭 `FOUND_ROWS`，`updated=false` 对应真实未改变。超萌挑战仍允许携带历史实际日期补报，以便离线队列跨日重试。

回归覆盖真实 TypeORM SQL 生成、逐条 SQL 赋值语义、凭证拒绝、超萌挑战跨日补报、超过 776 个身份创建、唯一键并发碰撞重试及迁移兼容。需要 Node.js 20 或更新版本运行 Nest 11/Jest 30（推荐 Node.js 24）。本机未配置隔离 MySQL，上线前还需在 MySQL 8 验证真实 upsert 受影响行数、并发及迁移；单测不会连接生产数据库。

## 2026-10-10 微信客户端与统计契约

2026-10-11 按用户要求，客户端已接入 `/user/generate`、`/rank/submit` 和 `/rank/list`，预览、H5、微信统一展示关卡模式（type=1）、无尽模式（type=2）、超萌挑战（type=3）真实榜单。超萌挑战按上海自然日分榜。只提交三榜所需的成绩字段，金币、猫咪、道具及完整玩法存档仍保存在本机；埋点继续使用独立匿名统计 ID。

事件目录 v2 由 `../cat-world/analytics/track-events.json` 同源生成，新增 `level_resume`、`cat_skill_use`，每日独立补给使用 `tool_supply_claim`。属性按逐事件字段和类型白名单清洗，未知字段不会写入。客户端与服务必须同步发布，否则旧服务会丢弃新增事件。

看板 `cohorts` 按匿名统计 ID + 平台在全历史首次 `app_launch` 日期分群，使用上海自然日 D1/D3/D7 再次启动比例；今天仍在观察中，未满观察期为 null。进第 2 关/通第 5、20 关为截至查询结束的主线累计达成率，mode 筛选不改变启动留存口径。清理本地 ID、重装或统计版本迁移会影响分群，结果不是账号级跨设备留存。历史 ID 与新匿名 ID 不做远端关联回填。

新增查询已做单元测试，尚需正式 MySQL 数据规模下验证 SQL/索引/延迟；未在本轮部署线上服务。
