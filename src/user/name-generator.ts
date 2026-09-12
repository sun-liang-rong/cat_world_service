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

    for (const name of this.cozyNames()) {
      names.add(name);
    }
    for (const name of this.behaviorNames()) {
      names.add(name);
    }
    for (const name of this.talentNames()) {
      names.add(name);
    }
    for (const name of SHORT_NAMES) {
      names.add(name);
    }

    return [...names].filter((name) => this.isValid(name));
  }

  private cozyNames(): string[] {
    return combine(COZY_HEADS, COZY_TAILS);
  }

  private behaviorNames(): string[] {
    const names: string[] = [];
    for (const tail of BEHAVIOR_TAILS) {
      for (const verb of LOVE_BEHAVIORS) {
        names.push(`爱${verb}的${tail}`);
      }
      for (const verb of CAN_BEHAVIORS) {
        names.push(`会${verb}的${tail}`);
      }
    }
    return names;
  }

  private talentNames(): string[] {
    return combine(TALENT_BEHAVIORS, TALENT_TAILS);
  }

  private isValid(name: string): boolean {
    if (name.length < 2 || name.length > 8) {
      return false;
    }
    if (!/^[\u4e00-\u9fa5]+$/.test(name)) {
      return false;
    }
    return !BANNED.some((word) => name.includes(word));
  }
}

// 直接收录的软萌短名：团子、小奶猫、呼噜兽……
const SHORT_NAMES = [
  '团子',
  '糯米',
  '麻薯',
  '汤圆',
  '泡芙',
  '奶冻',
  '布丁',
  '曲奇',
  '奶糕',
  '毛球',
  '绒球',
  '铃铛',
  '小奶猫',
  '小肉垫',
  '小呼噜',
  '揣手手',
  '小毛球',
  '小尾巴',
  '小团子',
  '小绒球',
  '小爪印',
  '小肉球',
  '小耳朵',
  '小胡须',
  '小馋猫',
  '小懒猫',
  '呼噜兽',
  '蹭蹭怪',
  '软绵绵',
  '圆嘟嘟',
  '奶团子',
  '毛球球',
  '喵呜酱',
  '小铃铛',
  '小麻薯',
  '小汤圆',
  '小泡芙',
  '小布丁',
];

// 修饰语 + 软萌主体：奶味小猫爪、毛茸茸小尾巴
const COZY_HEADS = [
  '奶味',
  '奶香',
  '奶油',
  '软软',
  '糯糯',
  '圆圆',
  '甜甜',
  '香香',
  '暖暖',
  '乖乖',
  '困困',
  '胖嘟嘟',
  '毛茸茸',
  '软乎乎',
  '胖乎乎',
  '暖乎乎',
  '香喷喷',
  '呼噜噜',
  '甜蜜蜜',
];

const COZY_TAILS = [
  '小猫爪',
  '小肉垫',
  '小团子',
  '小奶猫',
  '小绒球',
  '小尾巴',
  '小耳朵',
  '小毛球',
  '小爪印',
  '小铃铛',
  '小麻薯',
  '小汤圆',
  '小泡芙',
  '小布丁',
  '小奶糕',
  '小曲奇',
  '小饼干',
  '小糯米',
  '团子',
  '麻薯',
  '奶糕',
];

// 爱X的Y / 会X的Y：爱睡觉的小猫、会踩奶的团子
const LOVE_BEHAVIORS = [
  '睡觉',
  '踩奶',
  '吃鱼',
  '晒太阳',
  '发呆',
  '撒娇',
  '蹭人',
  '打呼噜',
  '追蝴蝶',
  '翻肚皮',
  '伸懒腰',
  '揣手手',
  '舔毛',
  '玩毛线',
  '追尾巴',
  '喝奶奶',
  '打滚',
  '卖萌',
  '偷吃',
  '打盹',
  '装睡',
  '数星星',
];

const CAN_BEHAVIORS = [
  '踩奶',
  '撒娇',
  '蹭人',
  '卖萌',
  '装睡',
  '偷吃',
  '打滚',
  '发呆',
  '打呼噜',
  '追蝴蝶',
  '揣手手',
];

const BEHAVIOR_TAILS = [
  '小猫',
  '小喵',
  '猫咪',
  '团子',
  '毛球',
  '奶猫',
  '小可爱',
  '小家伙',
];

// X小能手 / X选手：踩奶小能手、揣手手小冠军
const TALENT_BEHAVIORS = [
  '踩奶',
  '晒肚皮',
  '卖萌',
  '发呆',
  '打滚',
  '揣手手',
  '追蝴蝶',
  '撒娇',
  '翻肚皮',
  '伸懒腰',
  '蹭蹭',
  '打盹',
  '装睡',
  '偷吃',
  '打呼噜',
];

const TALENT_TAILS = ['小能手', '选手', '小达人', '小冠军', '专业户'];

function combine(heads: string[], tails: string[]): string[] {
  const names: string[] = [];
  for (const head of heads) {
    for (const tail of tails) {
      names.push(`${head}${tail}`);
    }
  }
  return names;
}
