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
    "platform":"preview",
    "app_version":"1.0.0",
    "events":[
      {"event_id":"e1","name":"app_launch","ts":1758350000000,"props":{"is_new_user":true}},
      {"event_id":"e2","name":"level_start","ts":1758350001800,"props":{"mode":"main","level":1}}
    ]
  }'
```

P0 事件名：`app_launch` `loading_finish` `page_view` `level_enter_click` `level_start` `level_end` `level_next` `level_replay` `level_home` `level_go_build` `tutorial_done` `ad_entrance_show` `ad_click` `ad_result` `building_light` `shop_buy`。

查询埋点看板（只读聚合，不返回玩家进度；默认最近 7 天，最长 31 天。若配置了 `DASHBOARD_TOKEN`，需带 `X-Dashboard-Token`）。可视化页面在仓库 `web/`：`cd web && npm install && npm run dev`，开发环境代理到本服务 `/api`。

```bash
# 一次拉齐总览 / 漏斗 / 关卡 / 广告 / 页面
curl 'http://localhost:3000/api/track/dashboard?from=2026-09-14&to=2026-09-20&platform=all&mode=all'

# 也可分接口拉
curl 'http://localhost:3000/api/track/overview?platform=wechat'
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
