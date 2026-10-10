/**
 * Jest 测试桩：@nestjs/typeorm v12 只发布 ESM 产物，ts-jest 的 CJS 运行时
 * 无法 require（需求 7.2 的测试工具链问题）。单测并不真正依赖 TypeORM 的
 * Nest 集成，这里用最小桩替身并在 package.json 的 jest.moduleNameMapper
 * 中把 @nestjs/typeorm 映射到本文件，让单元测试可以离线运行。
 *
 * 覆盖服务代码用到的全部导出：InjectRepository（装饰器工厂）、
 * TypeOrmModule（forRoot/forFeature 空实现）、TypeOrmModuleOptions（类型，运行时消失）。
 */

export type TypeOrmModuleOptions = Record<string, unknown>;

export function InjectRepository(..._args: unknown[]): PropertyDecorator {
  return () => undefined;
}

export const TypeOrmModule = {
  forRoot(..._args: unknown[]) {
    return { module: class {}, providers: [], exports: [] };
  },
  forRootAsync(..._args: unknown[]) {
    return { module: class {}, providers: [], exports: [] };
  },
  forFeature(..._args: unknown[]) {
    return { module: class {}, providers: [], exports: [] };
  },
};
