# cat-world-service

《喵喵小镇》后端服务。NestJS + TypeORM + MySQL，框架保持精简，业务模块按后续需求再加。

## 启动

```bash
cd service
npm install
cp .env.example .env
npm run start:dev
```

默认端口 `3000`，接口前缀 `/api`。

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
- 连接信息写在 `.env`（参考 `.env.example`）
- 开发期 `DB_SYNC=true`，后续有表结构后再关掉
