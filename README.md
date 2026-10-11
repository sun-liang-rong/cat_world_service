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

提交排行榜成绩：

```bash
# 关卡榜 type=1
curl -X POST http://localhost:3000/api/rank/submit \
  -H 'Content-Type: application/json' \
  -d '{"user_id":"K7M2P9QX","type":1,"level_count":12,"star_count":36}'

# 无尽榜 type=2
curl -X POST http://localhost:3000/api/rank/submit \
  -H 'Content-Type: application/json' \
  -d '{"user_id":"K7M2P9QX","type":2,"clear_count":128,"duration_ms":180000}'

# 超萌挑战榜 type=3，按日期存当天最好成绩
curl -X POST http://localhost:3000/api/rank/submit \
  -H 'Content-Type: application/json' \
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
- 排行榜表：`cat_world_rank`（用户 ID + 榜单类型 + 日期唯一；关卡/无尽日期为空，超萌挑战按天存）
- 埋点表：`cat_world_track_event`（按 `event_id` 去重；只存分析事件，不存玩家进度）
- 连接信息写在 `.env`（参考 `.env.example`）
- 开发期 `DB_SYNC=true`，后续有表结构后再关掉

## 2026-10-10 微信客户端与统计契约

2026-10-11 按用户要求，客户端已接入 `/user/generate`、`/rank/submit` 和 `/rank/list`，预览、H5、微信统一展示关卡模式（type=1）、无尽模式（type=2）、超萌挑战（type=3）真实榜单。超萌挑战按上海自然日分榜。只提交三榜所需的成绩字段，金币、猫咪、道具及完整玩法存档仍保存在本机；埋点继续使用独立匿名统计 ID。

事件目录 v2 由 `../cat-world/analytics/track-events.json` 同源生成，新增 `level_resume`、`cat_skill_use`，每日独立补给使用 `tool_supply_claim`。属性按逐事件字段和类型白名单清洗，未知字段不会写入。客户端与服务必须同步发布，否则旧服务会丢弃新增事件。

看板 `cohorts` 按匿名统计 ID + 平台在全历史首次 `app_launch` 日期分群，使用上海自然日 D1/D3/D7 再次启动比例；今天仍在观察中，未满观察期为 null。进第 2 关/通第 5、20 关为截至查询结束的主线累计达成率，mode 筛选不改变启动留存口径。清理本地 ID、重装或统计版本迁移会影响分群，结果不是账号级跨设备留存。历史 ID 与新匿名 ID 不做远端关联回填。

新增查询已做单元测试，尚需正式 MySQL 数据规模下验证 SQL/索引/延迟；未在本轮部署线上服务。
