import { Injectable } from '@nestjs/common';

const BANNED = [
  '死',
  '杀',
  '血',
  '鬼',
  '坟',
  '尸',
  '魔',
  '邪',
  '惨',
  '恨',
  '丧',
  '痛',
  '哭',
  '病',
  '暗',
  '地狱',
  '深渊',
  '修罗',
  '战神',
  '至尊',
  '霸主',
  '弑',
  '魂',
  '魄',
  '圣皇',
  '天罚',
  '龙傲',
];

@Injectable()
export class NameGenerator {
  private readonly pool: string[];

  constructor() {
    this.pool = this.buildPool();
  }

  get size(): number {
    return this.pool.length;
  }

  pick(exclude: Set<string> = new Set()): string {
    for (let i = 0; i < 24; i += 1) {
      const name = this.pool[Math.floor(Math.random() * this.pool.length)];
      if (!exclude.has(name)) {
        exclude.add(name);
        return name;
      }
    }

    for (const name of this.pool) {
      if (!exclude.has(name)) {
        exclude.add(name);
        return name;
      }
    }

    throw new Error('可用昵称已用尽');
  }

  private buildPool(): string[] {
    const names = new Set<string>();

    for (const name of this.jobNames()) {
      names.add(name);
    }
    for (const name of this.playerNames()) {
      names.add(name);
    }
    for (const name of this.stackNames()) {
      names.add(name);
    }
    for (const name of FIXED_NAMES) {
      names.add(name);
    }

    return [...names].filter((name) => this.isValid(name));
  }

  private jobNames(): string[] {
    const groups: Array<{ heads: string[]; tails: string[] }> = [
      {
        heads: [
          '鱼干',
          '鱼干铺',
          '小鱼干',
          '猫粮',
          '猫粮店',
          '罐头',
          '猫条',
          '布丁',
          '奶糕',
          '奶油',
          '奶盖',
          '猫饼干',
          '猫零食',
          '猫草',
          '猫饼',
          '小鱼',
          '猫饭',
        ],
        tails: [
          '老板',
          '店长',
          '品鉴师',
          '主厨',
          '大厨',
          '摊主',
          '试吃员',
          '达人',
          '掌柜',
          '专家',
        ],
      },
      {
        heads: [
          '喵界',
          '猫窝',
          '喵屋',
          '猫屋',
          '猫咖',
          '窗台',
          '纸箱',
          '被窝',
          '阳台',
          '晒毯',
          '暖被',
          '花园',
          '小镇',
          '小屋',
          '工坊',
        ],
        tails: [
          '大佬',
          '管家',
          '馆长',
          '店长',
          '园丁',
          '顾问',
          '管理员',
          '值班员',
          '掌柜',
          '向导',
        ],
      },
      {
        heads: [
          '布丁',
          '猫爪',
          '猫爪印',
          '肉垫',
          '小肉垫',
          '绒绒',
          '毛球',
          '爪爪',
          '绒毛',
          '喵呜',
          '猫语',
          '暖阳',
        ],
        tails: ['侦探', '护理师', '按摩师', '达人', '助手', '专家', '顾问', '捕手'],
      },
      {
        heads: [
          '毛线',
          '毛线团',
          '逗猫棒',
          '猫抓板',
          '猫爬架',
          '铃铛',
          '猫铃',
          '纸箱',
          '逗猫',
        ],
        tails: ['工匠', '教练', '设计师', '收藏家', '达人', '编织师', '调音师'],
      },
      {
        heads: ['喵喵', '阳光', '午后', '月光', '猫咪', '猫树', '喷泉'],
        tails: ['达人', '顾问', '向导', '管家', '园丁', '馆长'],
      },
    ];

    return groups.flatMap((group) => combine(group.heads, group.tails));
  }

  private playerNames(): string[] {
    const heads = [
      '晒太阳',
      '熬夜吸猫',
      '窗台发呆',
      '午睡',
      '打盹',
      '撸猫',
      '吸猫',
      '踩奶',
      '发呆',
      '追光',
      '逗猫',
      '晒肚',
      '翻肚皮',
      '追尾巴',
      '晒肚皮',
      '伸懒腰',
      '深夜投喂',
      '阳台晒猫',
      '纸箱探险',
      '被窝躺平',
      '追蝴蝶',
      '晒暖阳',
      '清晨巡猫',
      '沙发趴着',
      '键盘监督',
      '屏幕守护',
      '毛球追逐',
      '罐头开箱',
      '猫草品尝',
      '窗台放空',
      '午后打盹',
      '夜里巡视',
      '阳台发呆',
      '被窝取暖',
      '纸箱躲猫',
      '花园散步',
      '晒被窝',
      '撸毛',
      '吸一口猫',
      '追毛球',
      '晒窗台',
      '夜猫',
      '躺平吸猫',
      '慢生活',
    ];
    return combine(heads, ['玩家', '选手', '人']);
  }

  private stackNames(): string[] {
    const prefixes = [
      '猫爪',
      '肉垫',
      '喵呜',
      '尾巴',
      '爪爪',
      '绒绒',
      '喵喵',
      '鱼干',
      '奶糕',
      '毛球',
      '阳光',
      '被窝',
      '猫条',
      '罐头',
      '小鱼',
      '布丁',
      '铃铛',
      '毛线',
      '纸箱',
      '窗台',
      '肚皮',
      '猫草',
      '爪印',
      '耳朵',
      '胡子',
      '眼睛',
      '脚步',
      '呼噜',
      '奶香',
      '猫窝',
      '蝴蝶',
      '小爪',
      '喵星',
      '猫饼',
      '奶油',
      '绒毛',
      '猫眼',
      '晒毯',
      '窗边',
      '纸盒',
      '逗猫',
      '猫铃',
      '小鼻',
      '猫步',
      '午后',
      '晚风',
      '清晨',
      '夜里',
      '暖阳',
      '软糕',
    ];
    const stacks = [
      '拍拍',
      '踩踩',
      '轻轻',
      '摇摇',
      '摸摸',
      '抱抱',
      '蹭蹭',
      '香香',
      '软软',
      '滚滚',
      '暖暖',
      '满满',
      '跳跳',
      '晃晃',
      '叮叮',
      '团团',
      '躲躲',
      '眯眯',
      '晒晒',
      '青青',
      '竖竖',
      '翘翘',
      '圆圆',
      '弯弯',
      '绵绵',
      '甜甜',
      '洒洒',
      '飞飞',
      '闪闪',
      '脆脆',
      '酥酥',
      '蓬蓬',
      '蹦蹦',
      '亮亮',
      '亲亲',
      '慢慢',
      '藏藏',
      '乐乐',
      '鲜鲜',
      '转转',
      '动动',
      '嗅嗅',
      '懒懒',
      '悄悄',
      '绕绕',
      '游游',
      '厚厚',
      '睡睡',
    ];
    return combine(prefixes, stacks);
  }

  private isValid(name: string): boolean {
    if (name.length < 4 || name.length > 6) {
      return false;
    }
    if (!/^[\u4e00-\u9fa5]+$/.test(name)) {
      return false;
    }
    return !BANNED.some((word) => name.includes(word));
  }
}

const FIXED_NAMES = [
  '鱼干铺老板',
  '喵界大佬',
  '布丁侦探',
  '晒太阳选手',
  '熬夜吸猫人',
  '猫爪拍拍',
  '猫粮品鉴师',
];

function combine(heads: string[], tails: string[]): string[] {
  const names: string[] = [];
  for (const head of heads) {
    for (const tail of tails) {
      names.push(`${head}${tail}`);
    }
  }
  return names;
}
