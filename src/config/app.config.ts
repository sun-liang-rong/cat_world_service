import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  port: Number(process.env.PORT ?? 3000),
  dashboardToken: process.env.DASHBOARD_TOKEN ?? '',
}));
