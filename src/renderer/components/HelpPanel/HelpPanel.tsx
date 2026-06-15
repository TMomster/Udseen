import { useState } from 'react'

// ─── 文档数据类型 ───

interface DocEntry {
  id: string
  title: string
  content: string[]
}

interface DocCategory {
  id: string
  label: string
  items: DocEntry[]
}

// ─── 简易文档（面向零基础创作者） ───

const SIMPLE_DOCS: DocCategory[] = [
  {
    id: 'quickstart',
    label: '快速上手',
    items: [
      {
        id: 'first-dialogue',
        title: '写第一段对话',
        content: [
          'say 就是"旁白"——没有角色头像，只有文字。',
          '角色.say 是让角色说话——会显示角色头像和名字。',
          '',
          '用 let 创建一个角色：',
          '  let hero = Character.set("hero.png", "勇者");',
          '  hero.begin();       // 默认 true，角色可见',
          '  hero.say("出发吧！");',
          '  say("你的冒险开始了！");',
          '  hero.say("前面好像有个村子。");',
          '',
          '用 say() 写旁白，用 角色名.say() 写角色对话。',
          '脚本一句一句往下执行，每句 say 都会等玩家点击后才继续。',
          '角色图片要放在 assets/public/character/ 文件夹里。'
        ]
      },
      { 
        id: 'first-text',
        title: '在画面上显示文字',
        content: [
          '用 Text.set("文字内容") 创建一个文本对象，可以自由设置样式和位置。',
          '',
          '示例：',
          '  let title = Text.set("勇者传说", "标题");',
          '  title.begin();',
          '  title.setPos(960, 200);   // 居中',
          '  title.size(64);           // 字号',
          '  title.bold();             // 加粗',
          '  title.hex("#FFD700");     // 金色',
          '  title.uline();            // 下划线',
          '',
          '支持样式方法：',
          '  size(val) 或 px(val) — 字号',
          '  rgb(r,g,b) 或 hex(h) — 颜色',
          '  bold — 加粗，italic — 斜体',
          '  uline — 下划线，deline — 删除线',
          '',
          '文本对象也支持位置移动、透明度、滤镜等所有场景对象功能。'
        ]
      },
      {
        id: 'first-choice',
        title: '让玩家做选择',
        content: [
          '用 choice 和 case 让玩家自己做决定。',
          '',
          '示例：',
          '  choice {',
          '      case "去森林" {',
          '          say("你走进了阴森的森林...");',
          '          hero.say("好黑啊，什么都看不见。");',
          '      }',
          '      case "去城堡" {',
          '          say("你来到了宏伟的城堡前。");',
          '          hero.say("好壮观的城堡！");',
          '      }',
          '  }',
          '',
          '玩家点击选项后会进入对应的 case 分支。',
          '分支执行完毕后继续往下走。'
        ]
      },
      {
        id: 'first-scene',
        title: '连续讲一段故事',
        content: [
          '把几个命令连起来就能讲一段完整的故事。',
          '',
          '示例：',
          '  let bg = Background.set("forest.jpg");',
          '  bg.begin();',
          '  say("这是一个宁静的早晨。");',
          '',
          '  let hero = Character.set("hero.png", "勇者");',
          '  hero.begin();',
          '  hero.setPos(400, 500);',
          '  hero.say("今天要去冒险了！");',
          '',
          '  let npc = Character.set("npc1.png", "村民");',
          '  npc.begin();',
          '  npc.setPos(800, 500);',
          '  npc.say("年轻人，路上小心。");',
          '',
          '脚本从上往下执行，每句 say() 都要等玩家点击才继续。',
          '可以用 Character.set 创建角色，Background.set 创建背景。'
        ]
      }
    ]
  },
  {
    id: 'characters',
    label: '角色管理',
    items: [
      {
        id: 'ch-create',
        title: '创建角色并让他登场',
        content: [
          '创建角色需要两步：',
          '1. Character.set("图片名", "显示名称") — 创建角色',
          '2. 角色名.begin() — 让角色登场（默认可见）',
          '',
          '示例：',
          '  let hero = Character.set("hero.png", "勇者");',
          '  hero.begin();       // 角色登场',
          '',
          '也可以同时创建多个角色：',
          '  let npc1 = Character.set("npc1.png", "村民甲");',
          '  let npc2 = Character.set("npc2.png", "村民乙");',
          '  npc1.begin();',
          '  npc2.begin();'
        ]
      },
      {
        id: 'ch-talk',
        title: '多角色对话',
        content: [
          '多个角色轮流说话，就像看剧本一样。',
          '',
          '示例：',
          '  let hero = Character.set("hero.png", "勇者");',
          '  let npc = Character.set("npc1.png", "村民");',
          '  hero.begin(1);',
          '  npc.begin(1);',
          '',
          '  npc.say("你来了，我等你很久了。");',
          '  hero.say("你知道我会来？");',
          '  npc.say("当然，命运指引你来到这里。");',
          '',
          '谁说话就调谁的 say()，对话框会自动切换头像和名字。'
        ]
      },
      {
        id: 'ch-appear',
        title: '角色登场与退场',
        content: [
          '用 begin() 让角色"登场"，用 end() 让角色"退场"。',
          '',
          'begin(visible = true)：默认 visible=true，角色可见。',
          '  begin(false) 让角色隐藏登场（配合 visible(true, time) 实现渐显）。',
          '',
          'autobegin(visible = true)：登场后自动 end() 销毁（50ms 后自动清理）。',
          '  适合临时出现的角色，比如一闪而过的路人。',
          '',
          'visible(able: bool, time?: num)：控制可见性。',
          '  visible(true) = 显示，visible(false) = 隐藏（不销毁）。',
          '  带 time 参数时产生渐显/渐隐效果。',
          '',
          'end()：彻底销毁角色，释放内存。',
          '',
          '示例：',
          '  let temp = Character.set("guest.png", "客人");',
          '  temp.autobegin();      // 自动登场+销毁',
          '',
          '  let main = Character.set("hero.png", "勇者");',
          '  main.begin();          // 手动管理',
          '  main.say("我来了");',
          '  main.visible(false, 1000);  // 1秒渐隐',
          '  main.end();            // 彻底销毁',
        ]
      },
      {
        id: 'ch-move',
        title: '让角色在舞台上移动',
        content: [
          '舞台大小是 1920x1080（宽x高）。用 setPos 或 moveTo 让角色在舞台上走动。',
          '',
          'setPos(x, y, time)：直接移动到舞台上的某个位置',
          '  x=横坐标（0~1920，0是最左边），y=纵坐标（0~1080，0是最上边）',
          '  time=移动时间（毫秒），不写就瞬间到达',
          '',
          'moveTo(dx, dy, time)：从当前位置"再走几步"',
          '  dx=横着走多少（正数=向右，负数=向左）',
          '  dy=竖着走多少（正数=向下，负数=向上）',
          '  time=移动时间（毫秒），不写就瞬间移动',
          '',
          '示例：',
          '  hero.setPos(200, 500, 0);      // 瞬间移到(200,500)的位置',
          '  hero.moveTo(300, 0, 2000);     // 2秒内向右走300像素',
          '  hero.moveTo(0, -100, 1500);    // 1.5秒内向上走100像素',
          '',
          'time单位是毫秒（1000=1秒，500=0.5秒），不写就瞬间移动。'
        ]
      },
      {
        id: 'ch-look',
        title: '改变角色外观效果',
        content: [
          '可以给角色加各种视觉效果，每个效果都可以传"持续时间"让变化看起来更自然。',
          '',
          '通用格式：角色名.功能名(数值, 持续时间, 滤镜强度)',
          '  数值       — 效果的目标值',
          '  持续时间   — 毫秒，不写就瞬间变化',
          '  滤镜强度   — 0~1（选填，默认=1），控制效果有多明显',
          '',
          '透明度：',
          '  hero.alpha(0.5, 1000);  ← 数值=0~1（0=全透明看不见，1=完全不透明）',
          '                               1000毫秒=1秒内慢慢变成半透明',
          '',
          '缩放大小：',
          '  hero.scale(1.5, 500);   ← 数值=倍数（1=原始，1.5=放大1.5倍，0.5=缩小一半）',
          '                               500毫秒=0.5秒内慢慢变大',
          '',
          '旋转角度：',
          '  hero.rotate(45, 800);   ← 数值=角度（顺时针45度，负数为逆时针）',
          '                               800毫秒=0.8秒内慢慢转过去',
          '',
          '模糊效果：',
          '  hero.blur(1.0, 600);          ← 数值=模糊强度（0=清晰，建议0~2）',
          '                                   600毫秒=0.6秒内慢慢变糊',
          '  hero.blur(1.0, 600, 0.5);     ← 第三个参数=滤镜强度 0.5=50%强度模糊',
          '',
          '明度 / 对比度 / 饱和度 / 伽马：',
          '  hero.brightness(0.5, 1000);          ← 明度0~2（0=全黑，1=正常，2=加倍亮）',
          '  hero.brightness(0.5, 1000, 0.3);     ← 可加滤镜强度，0.3=30%效果',
          '  hero.contrast(1.5, 800, 0.6);        ← 对比度1.5倍，800ms渐变，60%强度',
          '  hero.saturation(0, 500);             ← 饱和度0=黑白，500ms去色',
          '  hero.gamma(1.5, 1000, 0.5);          ← 伽马校正，50%强度',
          '',
          '特殊滤镜效果：',
          '  hero.bw(1.0, 800);               ← 黑白效果，val=0~1（1=完全黑白）',
          '  hero.bw(1.0, 800, 0.5);           ← 50%强度的黑白效果',
          '  hero.distort(1.0, 600);           ← 失真效果（颜色通道错位）',
          '  hero.psychedelic(1.0, 1000);      ← 迷幻效果（色彩旋转）',
          '',
          '颜色滤镜——用"红绿蓝"来调色：',
          '  hero.rgb(255, 100, 100);     ← 三个数字分别控制红、绿、蓝的强度',
          '                                每个数字范围0~255',
          '                                255,100,100 = 红色最强，画面偏红',
          '                                255,255,255 = 红绿蓝全满=正常（白色光）',
          '                                0,0,0 = 全关=画面变黑',
          '',
          '  第四个参数=渐变时间（毫秒），如 hero.rgb(255,100,100, 800) 在0.8秒内渐变到偏红',
          '  第五个参数=滤镜强度（0~1），如 hero.rgb(255,0,0, 500, 0.3) = 30%强度红色滤镜',
          '',
          '十六进制颜色滤镜：',
          '  hero.hex("#FF6600");              ← 用颜色代码，如"#FF6600"=橙色',
          '  hero.hex("#FF6600", 500);         ← 500ms渐变到橙色',
          '  hero.hex("#FF6600", 500, 0.3);    ← 加滤镜强度=30%',
          '',
          '持续时间单位是毫秒（1000=1秒，500=0.5秒），不写就瞬间变化。',
          '滤镜强度默认=1（全效果），设为0~1可减弱效果。',
          '多个效果可以同时叠加使用，比如边模糊边旋转。'
        ]
      },
      {
        id: 'ch-active',
        title: '检查角色是否在舞台上',
        content: [
          '用 isActive() 检查角色当前是否在舞台上。',
          '舞台上显示 → 返回 true，隐藏或销毁 → 返回 false。',
          '',
          '示例：',
          '  let hero = Character.set("hero.png", "勇者");',
          '  hero.begin(1);',
          '  if (hero.isActive()) {',
          '      hero.say("我准备好了！");',
          '  }',
          '',
          '可以配合 end() 检查角色是否已被销毁，',
          '也可用于音频判断正在播放还是已暂停/停止。'
        ]
      },
    ]
  },
  {
    id: 'scene',
    label: '场景与背景',
    items: [
      {
        id: 'bg-change',
        title: '切换背景',
        content: [
          '用 Background.set 创建背景，再 begin() 让它显示出来。',
          '新的背景会覆盖旧的背景。',
          '',
          '示例：',
          '  let bg = Background.set("castle.jpg");',
          '  bg.begin();',
          '',
          '背景图片会自动缩放到舞台大小（1920x1080）。',
          '图片放在 assets/public/background/ 文件夹里。',
          '',
          '纯色背景预置（顶层覆盖）：',
          '  Background.full_screen();    // 全屏黑色覆盖',
          '  Background.full_white();     // 全屏白色覆盖',
          '',
          '这两个预置会自动在最顶层显示（zIndex=10000），适合黑屏+文字等场景。'
        ]
      },
      {
        id: 'bg-fx',
        title: '背景变化效果',
        content: [
          '背景也能加各种视觉效果，用法和角色一样。',
          '通用格式：背景名.功能名(数值, 持续时间, 滤镜强度)',
          '',
          '背景半透明：',
          '  bg.alpha(0.3, 2000);         ← 数值0~1（0=全透明，1=不透明）',
          '                                  2000毫秒=2秒内慢慢变半透明',
          '',
          '背景模糊：',
          '  bg.blur(0.8, 1000);          ← 数值=模糊强度，建议0~2',
          '                                  1000毫秒=1秒内慢慢变模糊',
          '  bg.blur(0.8, 1000, 0.5);     ← 可加滤镜强度，0.5=50%强度',
          '',
          '背景亮度（对比度/饱和度/伽马用法相同）：',
          '  bg.brightness(0.5, 1500);        ← 数值=明暗（0=全黑，1=正常，2=加倍亮）',
          '  bg.brightness(0.5, 1500, 0.6);   ← 滤镜强度0.6=60%效果',
          '  bg.contrast(1.2, 800);           ← 对比度1.2倍',
          '  bg.saturation(0.5, 1000);        ← 饱和度0.5',
          '',
          '颜色滤镜：',
          '  bg.rgb(255, 100, 100, 1000);       ← 红绿蓝调色+1000ms渐变',
          '  bg.rgb(255, 0, 0, 500, 0.3);       ← 500ms渐变，30%强度红色',
          '  bg.hex("#FF6600");                 ← 十六进制色值',
          '  bg.hex("#FF6600", 800, 0.5);       ← 800ms渐变，50%强度橙色',
          '',
          '背景旋转：',
          '  bg.rotate(180, 3000);    ← 数值=角度（顺时针旋转，90=四分之一圈）',
          '                              3000毫秒=3秒内慢慢转半圈',
          '',
          '注意：背景不支持 index() 图层控制。背景默认在最底层。'
        ]
      }
    ]
  },
  {
    id: 'media',
    label: '音乐与音效',
    items: [
      {
        id: 'audio-bgm',
        title: '添加背景音乐',
        content: [
          '用 Audio.set 创建背景音乐，loop() 让它循环播放。',
          '路径里要写子目录，比如 "bgm/" 开头。',
          '',
          '示例：',
          '  let bgm = Audio.set("bgm/theme.mp3");',
          '  bgm.loop();',
          '',
          '音频文件放在 assets/public/audio/ 文件夹里。',
          '路径必须带上子目录：bgm/（音乐）、effect/（音效）、vocal/（配音）。',
          '支持 mp3、ogg、wav 等常见格式。'
        ]
      },
      {
        id: 'audio-control',
        title: '控制音量与暂停',
        content: [
          '创建好音频后，可以用下面这些方法来控制它。',
          '',
          '调节音量：',
          '  bgm.volume(50, 2000);   ← 数值=音量，范围0~100（0=静音，100=最大声）',
          '                             时间=2000毫秒（2秒内慢慢变到目标音量）',
          '',
          '暂停播放：',
          '  bgm.pause();             ← 暂停后可以接着放（下次从暂停位置继续）',
          '',
          '停止播放：',
          '  bgm.stop();              ← 停止后从头开始放',
          '',
          '淡出效果：',
          '  bgm.fadeOut();           ← 音量逐渐减到0然后停止，适合场景切换时用',
          '',
          '所有音频统一用 Audio 控制，支持 loop() 循环播放和单次播放。'
        ]
      }
    ]
  },
  {
    id: 'script',
    label: '用好脚本功能',
    items: [
      {
        id: 'memory',
        title: '记下数值让故事有变化',
        content: [
          '用变量"记住一个数字"，然后根据这个数字让故事走向不同。',
          '',
          '示例：',
          '  let courage = 0;',
          '  choice {',
          '      case "勇敢地走进森林" {',
          '          courage = courage + 10;',
          '      }',
          '      case "绕路走大路" {',
          '          courage = courage + 5;',
          '      }',
          '  }',
          '  if (courage >= 10) {',
          '      say("你觉得自己充满了勇气！");',
          '  } else {',
          '      say("你有点后悔没有更勇敢一点。");',
          '  }',
          '',
          '变量就像一个记事本，写上名字和数字。',
          'if 判断括号里的条件，条件成立就执行对应代码。'
        ]
      },
      {
        id: 'multi-do',
        title: '同时做多件事',
        content: [
          '用 async { } 让多个动作"同时进行"。',
          '',
          '示例：',
          '  async {',
          '      hero.moveTo(400, 500, 2000);',
          '      side.moveTo(700, 500, 2000);',
          '  }',
          '',
          '  async(500) {',
          '      hero.moveTo(-200, 0, 3000);',
          '      side.moveTo(200, 0, 2000);',
          '  }',
          '',
          '注意：say()、choice() 不要放在 async 里面！'
        ]
      },
      {
        id: 'reuse',
        title: '把常用操作存起来',
        content: [
          '把一段常用操作"打包"成一个函数，需要时叫名字就能用。',
          '',
          '示例：',
          '  function showNpc(name, image, x, y) {',
          '      let ch = Character.set(image, name);',
          '      ch.begin(1);',
          '      ch.setPos(x, y, 500);',
          '      return ch;',
          '  }',
          '',
          '  let npc1 = showNpc("铁匠", "blacksmith.png", 300, 500);',
          '  let npc2 = showNpc("商人", "merchant.png", 800, 500);',
          '',
          'function 后面写名字和参数，{ } 里面写要执行的操作。',
          '调用时传入不同的参数，就能得到不同的效果。'
        ]
      },
      {
        id: 'debug',
        title: '检查哪里出了问题',
        content: [
          '用 print() 在后台查看某个变量的值，方便排查问题。',
          '',
          '示例：',
          '  let score = 42;',
          '  print(score);',
          '  print("当前分数：" + score);',
          '',
          '小技巧：',
          '- 编辑器里如果有红色下划线，说明脚本写错了，鼠标移上去看提示',
          '- 给变量起有意义的名字（比如 score 而不是 s）',
          '- print() 只有在开发者工具里能看到，玩家看不到'
        ]
      }
    ]
  }
]


// ─── 深度文档（API 参考） ───

const DEEP_DOCS: DocCategory[] = [
  {
    id: 'core',
    label: '核心语法',
    items: [
      {
        id: 'types-basic',
        title: '基本类型系统',
        content: [
          'Udseen 支持五种基本数据类型以及多种对象类型：',
          '',
          '基本类型：',
          '  num  - 数字，支持整数和小数，如 1、2.5、-3',
          '  str  - 字符串，用双引号包裹，如 "hello"',
          '  bool - 布尔值，取值为 true 或 false',
          '  arr  - 数组（集合），用 {} 包裹元素',
          '  map  - 映射（键值对集合），用 { key:type = value; ... } 声明',
          '',
          '数组声明语法：',
          '  arr ar1 = {1, 2, 3, 4, 5, "hello"};',
          '  arr ar2:num = {1, 2, 3};',
          '',
          '映射声明语法：',
          '  map position = {',
          '      posX: num = 0;',
          '      posY: num = 0;',
          '  }',
          '',
          '对象类型（ObjectType）：Number, String, Bool, Array, Map, Character, Background, Audio',
          '其中 Character/Background/Audio 是演出资源类型，需通过工厂对象创建。',
          '',
          '类型行为规则：',
          '  - 未标注类型的变量可随时赋值为其他类型',
          '  - 标注了类型的变量不可改变类型',
          '  - 未使用 ? 语法且未提供 = 初始值时会报错"变量需要初始化"',
          '',
          '类型转换规则：',
          '  num → bool：允许隐式转换，0=false，非0=true',
          '  bool → num：禁止转换（小类型不能转换为大类型），参与算术运算时报错',
          '  条件判断中的 num 自动按 isTruthy 规则处理'
        ]
      },
      {
        id: 'syntax-variable',
        title: '变量与作用域',
        content: [
          '变量声明语法：',
          '  let x = 10;',
          '  let flag: bool = true;',
          '  name = "Udseen";',
          '',
          '自动归零语法（?）：',
          '  let score?;',
          '  function add(a?, b?) { return a + b; }',
          '',
          '作用域规则：',
          '  - 函数体外声明 = 全局变量，整个脚本可访问',
          '  - 函数体内声明 = 局部变量，仅函数内有效',
          '  - { } 块内声明 = 块级变量，仅块内有效',
          '',
          '初始化规则：',
          '  - 未使用 ? 且未提供 = 初始值 → 编译报错',
          '  - 未标注类型的变量可随时更改类型',
          '  - 标注类型的变量不可改变类型',
          '',
          '命名限制：',
          '  - 只能包含字母、数字和下划线',
          '  - 不能以数字开头',
          '  - 区分大小写'
        ]
      },
      {
        id: 'syntax-operator',
        title: '运算符参考',
        content: [
          '运算符优先级（从高到低）：',
          '  1. 一元运算符：-（负号）、!（逻辑非）',
          '  2. 乘法类：*、/、%',
          '  3. 加法类：+、-',
          '  4. 比较类：<、<=、>、>=',
          '  5. 相等类：==、!=',
          '  6. 逻辑与：&&',
          '  7. 逻辑或：||',
          '',
          '算术运算符：+（加）、-（减）、*（乘）、/（除）、%（取模）',
          '比较运算符：==（等于）、!=（不等于）、<（小于）、<=（小于等于）、>（大于）、>=（大于等于）',
          '逻辑运算符：&&（逻辑与）、||（逻辑或）、!（逻辑非）',
          '',
          '字符串拼接：+ 也可以连接字符串，如 "你好，" + name',
          '注意：字符串与数字不能直接拼接，需确保两边类型一致。'
        ]
      },
      {
        id: 'syntax-control',
        title: '控制流',
        content: [
          '条件判断（if/else）：',
          '  if (score >= 90) {',
          '      say("优秀！");',
          '  } else if (score >= 60) {',
          '      say("及格。");',
          '  } else {',
          '      say("不及格...");',
          '  }',
          '',
          '条件写在 () 中，条件成立时执行对应的 { } 块。',
          'else if 和 else 可选。条件中可用 &&（并且）、||（或者）、!（取反）。',
          '',
          '循环（while）：',
          '  let i = 0;',
          '  while (i < 5) {',
          '      say("第" + i + "次");',
          '      i = i + 1;',
          '  }',
          '',
          'while 在每次循环前检查条件，true 继续，false 退出。',
          '注意避免死循环。',
          '',
          '⚠ 在 Udseen 中，if 和 while 内部的 say()、choice、动画操作都会阻塞执行。'
        ]
      },
      {
        id: 'syntax-function',
        title: '函数系统',
        content: [
          '函数定义语法：',
          '  function func_name(arg1, arg2) {',
          '      return arg1 + arg2;',
          '  }',
          '',
          '可选返回类型注解：',
          '  function add(a, b): num { return a + b; }',
          '',
          '参数支持自动归零（? 语法）：',
          '  function greet(name?) { say("Hello, " + name); }',
          '',
          '调用：func_name(arg1, arg2);',
          '所有语句都必须以分号结尾。',
          '',
          '与 ObjectFunction 的区别：',
          '  - 普通函数：独立调用，func_name(args)',
          '  - ObjectFunction：挂载在对象上调用，obj.func_name(args)'
        ]
      },
      {
        id: 'syntax-objectfn',
        title: '对象函数系统',
        content: [
          'ObjectFunction 定义语法：',
          '  ObjectFunction func_name(obj, arg1, arg2) {',
          '      ...',
          '  }',
          '',
          '类型限定（单类型）：',
          '  ObjectFunction Character::speak(obj, msg) {',
          '      ...',
          '  }',
          '',
          '类型限定（多类型）：',
          '  ObjectFunction (Character, Background)::func_name(obj, arg) {',
          '      ...',
          '  }',
          '',
          'auto obj 参数：',
          '  ObjectFunction 的第一个参数由系统自动传入，调用时无需显式传递。',
          '',
          '不同类型可为同名函数提供不同实现，类型限定更安全灵活。'
        ]
      }
    ]
  },
  {
    id: 'runtime',
    label: '运行模型',
    items: [
      {
        id: 'rt-exec',
        title: '执行与阻塞模型',
        content: [
          'Udseen 脚本按顺序逐行执行。',
          '',
          '阻塞操作（需要等待完成）：',
          '  - say()、ch.say()：等待玩家点击或自动播放延迟',
          '  - choice：等待玩家选择',
          '  - moveTo、setPos 等动画：等待动画完成',
          '  - System.wait()：等待指定时间',
          '',
          '非阻塞操作（立即完成）：',
          '  - 变量赋值：let x = 10;',
          '  - 条件判断：if (x > 5)',
          '  - print() 调试输出',
          '  - 纯数学运算',
          '',
          '自动播放模式：',
          '  say() 的推进延迟由 autoDelay 参数控制。',
          '  如果绑定了音频，延迟 = 音频时长 + audioExtraDelay。'
        ]
      },
      {
        id: 'rt-async',
        title: '异步并发模型',
        content: [
          '异步块语法：',
          '  async {',
          '      ch1.moveTo(100, 0, 1000);',
          '      ch2.moveTo(-100, 0, 1000);',
          '  }',
          '',
          '带超时的异步块：',
          '  async(500) {',
          '      ch1.moveTo(100, 0, 2000);',
          '      ch2.moveTo(-100, 0, 1000);',
          '  }',
          '',
          'time 参数行为：',
          '  - time=0 或不指定 → 等待组内所有动作完成后才继续执行',
          '  - time>0 → 最多等待 time 毫秒，之后立即继续',
          '',
          '⚠ 有限等待的风险：后续脚本可能操作正在执行动画的对象。',
          '',
          '约束：async 块内部不应放置 say()、choice() 等交互操作。'
        ]
      }
    ]
  },
  {
    id: 'ch-api',
    label: 'Character API',
    items: [
      {
        id: 'ch-factory',
        title: '工厂方法',
        content: [
          'Character.set(imagePath, displayName?)',
          '',
          '参数：',
          '  imagePath   - 必填，字符串，自动补全为 assets/public/character/{path}',
          '  displayName - 可选，对话框显示的角色名称',
          '',
          '返回值：Character 对象实例',
          '',
          '支持图片格式：png、jpg、gif、webp',
          '',
          '示例：',
          '  let hero = Character.set("hero.png", "勇者");',
          '  let npc  = Character.set("npc1.png");'
        ]
      },
      {
        id: 'ch-position',
        title: '位置与移动接口',
        content: [
          'setPos(x, y, time=0)',
          '  在 time 毫秒内移动到舞台坐标 (x, y)。舞台尺寸 1920x1080。',
          '  x=横坐标(0~1920)，y=纵坐标(0~1080)',
          '',
          'setPos(position, time=0)',
          '  目标点为 map {posX:num, posY:num}，适用于从 getPos() 返回值直接传入。',
          '',
          'moveTo(dx, dy, time=0)',
          '  相对当前位置移动。dx=横移量(正=右/负=左)，dy=纵移量(正=下/负=上)。',
          '',
          'getPos() → map {posX:num, posY:num}',
          '  获取当前位置坐标，返回包含 posX 和 posY 的 map。',
          '',
          'getPosX() → num',
          '  仅获取当前横坐标。',
          '',
          'getPosY() → num',
          '  仅获取当前纵坐标。',
          '',
          '舞台尺寸为 1920x1080（宽×高）。'
        ]
      },
      {
        id: 'ch-visual',
        title: '视觉属性接口',
        content: [
          '所有方法均支持 time 参数（毫秒），控制过渡动画时长。',
          'time=0 或不指定则为瞬时变化。',
          '',
          '透明度与滤镜：',
          '  alpha(val, time=0)                  - 透明度，val 范围 0~1.0（0=全透明，1=不透明）',
          '  blur(val, time=0, intensity=1)      - 高斯模糊强度，val 范围 0~2.0（0=清晰）',
          '  brightness(val, time=0, intensity=1)- 明度调节，val 范围 0~2.0（0=全黑，1=正常，>1=更亮）',
          '  contrast(val, time=0, intensity=1)  - 对比度，val 范围 0~2.0（1=正常）',
          '  saturation(val, time=0, intensity=1)- 饱和度，val 范围 0~2.0（0=黑白，1=正常）',
          '  gamma(val, time=0, intensity=1)     - 伽马校正，val 范围 0~10（1=正常，>1=变暗，<1=变亮）',
          '',
          '特殊滤镜效果：',
          '  bw(val, time=0, intensity=1)         - 黑白效果，val 范围 0~1（1=完全黑白）',
          '  distort(val, time=0, intensity=1)    - 失真效果，颜色通道错位',
          '  psychedelic(val, time=0, intensity=1)- 迷幻效果，色彩通道旋转',
          '',
          '颜色滤镜（RGB 概念说明）：',
          '  电脑屏幕上的颜色由红(Red)、绿(Green)、蓝(Blue)三种光混合而成。',
          '  每个颜色分量用 0~255 的数字表示强度——0=没有该色，255=该色最亮。',
          '  例如 rgb(255,0,0) = 纯红色，rgb(255,255,0) = 红色+绿色=黄色。',
          '',
          '  intensity 参数（所有滤镜通用）：控制整体效果的透明度，范围 0~1（1=全强度，0=无效果）',
          '  例：blur(1.0, 500, 0.5) = 50%强度的模糊，500ms 渐变',
          '',
          '  rgb(r, g, b, time=0, intensity=1)   - RGB 分层调色，r/g/b 各范围 0~255',
          '  hex(h, time=0, intensity=1)          - 十六进制调色，如 "#ff0000"（红色）',
          '',
          '旋转与缩放：',
          '  rotate(angle, time=0)      - 顺时针旋转指定角度（单位：度）',
          '  rotateTo(angle, time=0)    - 旋转到绝对角度（基于初始状态的总旋转量）',
          '  scale(val, time=0)         - 缩放倍数（1=原始大小，2=放大2倍，0.5=缩小一半）',
          '  scaleTo(val, time=0)       - 缩放到的目标倍数（基于初始状态的总缩放量）',
          '',
          '图层控制：',
          '  index(val)                 - 图层级，值越大越靠上（覆盖在其他角色前面）'
        ]
      },
      {
        id: 'ch-lifecycle',
        title: '生命周期',
        content: [
          'begin(visible=true)：角色出现在舞台上。',
          '  visible=true（默认）→ 角色可见',
          '  visible=false（即 begin(false)）→ 角色隐藏登场',
          '',
          'autobegin(visible=true)：登场后自动 end() 销毁（50ms 后）。',
          '  适用临时角色，用完即销毁。',
          '',
          'visible(able: bool, time?: num)：控制可见性。',
          '  visible(true) → 显示，visible(false) → 隐藏（不销毁）',
          '  带 time 参数时产生渐显/渐隐渐变效果',
          '',
          'end()：彻底销毁角色，释放精灵、纹理、滤镜资源。',
          '',
          '使用场景建议：',
          '  autobegin() → 临时角色',
          '  begin() → 贯穿全剧的主要角色',
          '  visible(false, 1000) → 1秒渐隐退场',
          '',
          '⚠ 不再使用的角色不及时 end() 会一直占用内存和 GPU 资源。'
        ]
      },
      {
        id: 'ch-active',
        title: 'isActive 状态查询',
        content: [
          'isActive() → bool',
          '',
          '返回角色当前是否处于活动状态（正在舞台上显示）。',
          '',
          '返回值说明：',
          '  true  - 角色已 begin()，正在舞台上，可以被操作',
          '  false - 角色已 end() 销毁，或尚未 begin()',
          '',
          '适用场景：',
          '  - 条件判断，避免对已销毁角色进行操作',
          '  - 与其他条件组合实现更复杂的逻辑分支',
          '',
          '示例：',
          '  if (hero.isActive()) {',
          '      hero.say("我还在舞台上！");',
          '  } else {',
          '      say("勇者已经退场了。");',
          '  }'
        ]
      }
    ]
  },
  {
    id: 'bg-api',
    label: 'Background API',
    items: [
      {
        id: 'bg-factory',
        title: '工厂方法',
        content: [
          'Background.set(imagePath, displayName?)',
          '',
          '参数：',
          '  imagePath   - 必填，字符串',
          '    自动补全为 assets/public/background/{path}',
          '    例如 "castle.jpg" 实际读取 assets/public/background/castle.jpg',
          '  displayName - 可选，背景显示名称',
          '',
          '返回值：Background 对象实例',
          '',
          '背景图片会自动缩放至舞台尺寸（1920x1080）。',
          '支持格式：png、jpg、gif、webp',
          '',
          '示例：',
          '  let bg = Background.set("castle.jpg", "城堡");',
          '  bg.begin();',
          '',
          '预置背景方法（无需参数，直接创建全屏纯色覆盖）：',
          '  Background.full_screen()   - 全屏黑色覆盖（顶层，zIndex=10000）',
          '  Background.full_white()    - 全屏白色覆盖（顶层，zIndex=10000）',
          '',
          '示例：',
          '  Background.full_screen();  // 全屏变黑',
          '  say("一片漆黑...只有文字在闪烁。");',
        ]
      },
      {
        id: 'bg-control',
        title: '属性接口',
        content: [
          '背景支持与角色相同的视觉属性接口，所有参数含义与 Character API 一致。',
          '每个方法均接受可选的 time 参数（毫秒），控制过渡动画时长。',
          '',
          '位置控制（舞台坐标系 1920x1080）：',
          '  bg.setPos(x, y, time)      ← x=横坐标(0~1920)，y=纵坐标(0~1080)',
          '                                time=动画时长(毫秒)，不写则瞬间移动',
          '  bg.moveTo(dx, dy, time)    ← dx=横向移动量(正=右/负=左)，dy=纵向移动量',
          '                                time=动画时长(毫秒)',
          '',
          '透明度：',
          '  bg.alpha(val, time)        ← val 范围 0~1.0（0=全透明，1=不透明）',
          '',
          '模糊效果：',
          '  bg.blur(val, time, intensity)      ← val 范围 0~2.0（0=清晰，越大越模糊）',
          '',
          '亮度调节：',
          '  bg.brightness(val, time, intensity)← val 范围 0~2.0（0=全黑，1=正常，>1=过曝）',
          '',
          '对比度：',
          '  bg.contrast(val, time, intensity)  ← val 范围 0~2.0（1=正常，>1=黑白更分明）',
          '',
          '饱和度：',
          '  bg.saturation(val, time, intensity)← val 范围 0~2.0（0=黑白，1=正常色彩）',
          '',
          '伽马校正：',
          '  bg.gamma(val, time, intensity)     ← val 范围 0~10（1=正常，>1=暗部更暗）',
          '',
          '滤镜强度 intensity（0~1，默认1）：控制整体效果的透明度',
          '  例：bg.blur(1.0, 500, 0.5) = 50%强度的模糊',
          '',
          'RGB 颜色滤镜（红/绿/蓝三色分层调色）：',
          '  bg.rgb(r, g, b, time, intensity)   ← r/g/b 各范围 0~255（数值越大对应色越重）',
          '                                        例：rgb(255,0,0)=红色滤镜',
          '                                        rgb(255,0,0, 500, 0.3) = 30%强度红色',
          '',
          '十六进制颜色滤镜：',
          '  bg.hex(h, time, intensity)         ← h 为十六进制色值，如 "#ff0000"=红色',
          '',
          '缩放：',
          '  bg.scale(val, time)        ← val=倍数（1=原始大小，2=放大2倍）',
          '',
          '旋转：',
          '  bg.rotate(angle, time)     ← angle=旋转角度（度，正数=顺时针）',
          '',
          '⚠ 背景不支持 index() 方法，默认处于场景最底层。'
        ]
      }
    ]
  },
  {
    id: 'text-api',
    label: 'Text API',
    items: [
      {
        id: 'text-factory',
        title: '工厂与基础用法',
        content: [
          'Text.set(text, displayName?) 创建文本对象，显示在画面上。',
          '',
          '参数：',
          '  text        - 必填，字符串，要显示的文本内容',
          '  displayName - 可选，对象显示名称',
          '',
          '返回值：Text 对象实例（实际为 SceneObject），支持所有场景对象方法。',
          '',
          '示例：',
          '  let t = Text.set("Hello World");',
          '  t.begin();',
          '  t.setPos(960, 540);    // 居中',
          '  t.size(48);             // 字号'
        ]
      },
      {
        id: 'text-style',
        title: '文本样式方法',
        content: [
          '所有样式方法可直接链式调用，但建议逐行使用。',
          '',
          '字号：',
          '  size(val) 或 px(val) — 设置字号，默认 32',
          '',
          '颜色：',
          '  rgb(r, g, b, time?, intensity?) — RGB 调色（0~255）',
          '  hex(h, time?, intensity?) — 十六进制颜色',
          '',
          '样式开关（无参数，直接调用即可启用）：',
          '  bold()   — 加粗',
          '  italic() — 斜体',
          '  uline()  — 下划线',
          '  deline() — 删除线',
          '',
          '位置与变换（与场景对象一致）：',
          '  setPos(x, y, time?) — 定位',
          '  moveTo(dx, dy, time?) — 移动',
          '  alpha(val, time?) — 透明度',
          '  rotate(angle, time?) — 旋转',
          '  scale(val, time?) — 缩放',
          '',
          '滤镜（与场景对象一致）：',
          '  blur, brightness, contrast, saturation, gamma',
          '  rgb, hex, bw, distort, psychedelic',
          '  glow, dropShadow, noise',
          '',
          '示例：',
          '  let title = Text.set("冒险开始", "标题");',
          '  title.begin();',
          '  title.setPos(960, 200);',
          '  title.size(72).bold().hex("#FFD700");',
          '  title.uline();',
          '  // 动画效果',
          '  title.alpha(0, 0);        // 先隐藏',
          '  title.visible(true, 1000); // 1秒淡入'
        ]
      }
    ]
  },
  {
    id: 'filter-api',
    label: '屏幕滤镜 API',
    items: [
      {
        id: 'filter-factory',
        title: '工厂与基础用法',
        content: [
          'Filter.set() 创建屏幕级滤镜，覆盖整个演出画面，与角色/背景的局部滤镜不同。',
          '',
          '基础用法：',
          '  let fl = Filter.set();       // 创建滤镜对象',
          '  fl.hex("#7F66FF", 500);      // 500ms 渐变到紫色',
          '  fl.begin();                   // 应用滤镜到舞台',
          '',
          '  // 稍后移除',
          '  fl.end();                     // 从舞台移除滤镜'
        ]
      },
      {
        id: 'filter-methods',
        title: '滤镜方法与参数',
        content: [
          '所有滤镜方法统一签名：(val, time=0, intensity=1)',
          '  val       - 目标值',
          '  time      - 渐变时间（毫秒），0=瞬间切换',
          '  intensity - 滤镜强度 0~1（1=全强度，0=无效果）',
          '',
          '颜色滤镜：',
          '  rgb(r, g, b, time=0, intensity=1)',
          '    r/g/b 范围 0~255，控制红/绿/蓝通道',
          '    例：fl.rgb(255, 0, 0) → 红色滤镜',
          '        fl.rgb(255, 0, 0, 800, 0.5) → 50%强度红色，800ms渐变',
          '',
          '  hex(h, time=0, intensity=1)',
          '    h = 十六进制色值，如 "#FF6600"',
          '    例：fl.hex("#FF6600", 500) → 500ms 渐变到橙色',
          '        fl.hex("#FF6600", 500, 0.3) → 30%强度橙色，500ms渐变',
          '',
          '色彩调节：',
          '  brightness(val, time=0, intensity=1)  明度 0~2.0（0=全黑，1=正常，>1=更亮）',
          '  contrast(val, time=0, intensity=1)    对比度 0~2.0（1=正常）',
          '  saturation(val, time=0, intensity=1)  饱和度 0~2.0（0=黑白，1=正常）',
          '  gamma(val, time=0, intensity=1)       伽马 0~10（1=正常）',
          '',
          '模糊：',
          '  blur(val, time=0, intensity=1)        高斯模糊 0~2.0（0=清晰）',
          '',
          '特殊滤镜：',
          '  bw(val, time=0, intensity=1)          黑白效果 0~1（1=完全黑白）',
          '  distort(val, time=0, intensity=1)     失真（颜色通道错位）',
          '  psychedelic(val, time=0, intensity=1)  迷幻（色彩通道旋转）',
          '',
          '强度控制：',
          '  intensity(val, time=0)                 全局滤镜强度 0~1',
          '    time>0 时渐显到目标强度',
          '    例：fl.intensity(0.5, 1000) → 1秒内渐显到50%强度',
          '',
          '示例：',
          '  let fl = Filter.set()',
          '  fl.rgb(255, 100, 100, 800, 0.3)   // 800ms 渐变为30%强度红色滤镜',
          '  fl.begin()                         // 应用',
          '  @wait(2000)',
          '  fl.intensity(0, 500)               // 500ms 淡出滤镜',
          '  fl.end()                           // 清理'
        ]
      }
    ]
  },
  {
    id: 'audio-api',
    label: '音频系统 API',
    items: [
      {
        id: 'audio-factory',
        title: '工厂与类型',
        content: [
          '所有音频资源统一通过 Audio 工厂对象创建和控制。',
          '',
          'Audio.set(path)',
          '  - 参数 path：必填，字符串',
          '    自动补全为 assets/public/audio/{path}',
          '    路径必须以子目录开头，例如 "bgm/"、"effect/"、"vocal/"',
          '  - 返回值：Audio 对象实例',
          '',
          '支持格式：mp3、ogg、opus、wav、aac、m4a、flac、webm',
          '',
          '示例：',
          '  let bgm   = Audio.set("bgm/theme.mp3");   // 背景音乐',
          '  let se    = Audio.set("effect/click.wav"); // 点击音效'
        ]
      },
      {
        id: 'audio-control',
        title: '播放控制',
        content: [
          'begin()      - 单次播放。调用后音频从头开始播放一次',
          'loop()       - 循环播放。音频会无限循环，直到被 pause() 或 stop() 停止',
          'pause()      - 暂停播放。暂停后调用 begin() 可从暂停位置继续',
          'stop()       - 停止播放。停止后调用 begin() 从头开始播放',
          'isActive() → bool',
          '  - 是否正在播放中',
          '  - true = 音频正在播放',
          '  - false = 已暂停、已停止，或从未开始播放',
          '',
          'volume(vol, time=0)',
          '  - vol：目标音量，范围 0~100（0=静音，100=最大声）',
          '    会自动四舍五入到一位小数',
          '  - time：渐变持续时间（毫秒）',
          '    time=0 或不写则瞬间切换音量',
          '  - 示例：bgm.volume(30, 2000);  // 2秒内音量逐渐降到30',
          '',
          'fadeOut()',
          '  - 淡出效果：音量逐渐减到0后自动停止',
          '  - 适合场景切换、章节结束时使用',
          '',
          '示例：',
          '  let bgm = Audio.set("bgm/theme.mp3");',
          '  bgm.loop();',
          '  bgm.volume(30, 2000);   // 2秒内将音量降到30',
          '  bgm.fadeOut();           // 逐渐淡出'
        ]
      }
    ]
  },
  {
    id: 'builtin-api',
    label: '内置 API',
    items: [
      {
        id: 'builtin-math',
        title: 'Math 对象',
        content: [
          'Math.PI         - 圆周率 π',
          'Math.E          - 自然常数 e',
          '',
          'Math.sqrt(x)    - 平方根',
          'Math.abs(x)     - 绝对值',
          'Math.floor(x)   - 向下取整',
          'Math.ceil(x)    - 向上取整',
          'Math.round(x)   - 四舍五入',
          'Math.max(a, b)  - 最大值',
          'Math.min(a, b)  - 最小值',
          '',
          '使用方式：',
          '  let r = Math.sqrt(16); // r = 4'
        ]
      },
      {
        id: 'builtin-print',
        title: 'print 调试',
        content: [
          'print(value)',
          '  在开发者工具控制台输出信息，用于调试。',
          '  仅在 Electron DevTools 中可见，不影响游戏画面。',
          '',
          '使用示例：',
          '  let x = 42;',
          '  print(x);',
          '  print("分数：" + x);'
        ]
      }
    ]
  }
]

// ─── API 总表组件（HTML 表格，不做解释） ───

interface ApiRow {
  name: string
  signature: string
  desc: string
}

interface ApiSection {
  title: string
  subsections?: { title: string; rows: ApiRow[] }[]
  rows?: ApiRow[]
}

const API_SECTIONS: ApiSection[] = [
  {
    title: '全局工厂方法',
    rows: [
      { name: 'Character.set', signature: 'Character.set(imagePath: str, displayName?: str)', desc: '→ Character' },
      { name: 'Background.set', signature: 'Background.set(imagePath: str, displayName?: str)', desc: '→ Background' },
      { name: 'Background.full_screen', signature: 'Background.full_screen()', desc: '→ Background（纯黑全屏覆盖）' },
      { name: 'Background.full_white', signature: 'Background.full_white()', desc: '→ Background（纯白全屏覆盖）' },
      { name: 'Audio.set', signature: 'Audio.set(path: str)', desc: '→ AudioObject' },
      { name: 'Filter.set', signature: 'Filter.set()', desc: '→ FilterObject' },
      { name: 'Text.set', signature: 'Text.set(text: str, displayName?: str)', desc: '→ Text（文本对象）' },
    ]
  },
  {
    title: '全局内置函数',
    rows: [
      { name: 'say', signature: 'say(text: str, audio?: str)', desc: '旁白（无角色头像）' },
      { name: 'speech', signature: 'speech(visible: num)', desc: '控制对话框显隐' },
      { name: 'pause', signature: 'pause()', desc: '等待玩家点击' },
      { name: 'print', signature: 'print(value: any)', desc: '控制台调试输出' },
      { name: 'parallel', signature: 'parallel(...animations: function[])', desc: '并行执行多个动画' },
      { name: 'sequence', signature: 'sequence(...animations: function[])', desc: '顺序执行多个动画' },
      { name: 'choice', signature: 'choice { case "text" { ... } }', desc: '分支选择' },
      { name: 'async', signature: 'async { ... } / async(time: num) { ... }', desc: '异步并发块' },
      { name: 'function', signature: 'function name(args) { ... }', desc: '自定义函数定义' },
      { name: 'return', signature: 'return value', desc: '函数返回值' },
    ]
  },
  {
    title: 'Math 对象',
    rows: [
      { name: 'Math.random', signature: 'Math.random()', desc: '→ num' },
      { name: 'Math.floor', signature: 'Math.floor(x: num)', desc: '→ num' },
      { name: 'Math.ceil', signature: 'Math.ceil(x: num)', desc: '→ num' },
      { name: 'Math.round', signature: 'Math.round(x: num)', desc: '→ num' },
      { name: 'Math.abs', signature: 'Math.abs(x: num)', desc: '→ num' },
      { name: 'Math.min', signature: 'Math.min(...args: num[])', desc: '→ num' },
      { name: 'Math.max', signature: 'Math.max(...args: num[])', desc: '→ num' },
      { name: 'Math.sin', signature: 'Math.sin(x: num)', desc: '→ num' },
      { name: 'Math.cos', signature: 'Math.cos(x: num)', desc: '→ num' },
      { name: 'Math.PI', signature: 'Math.PI', desc: '→ num（常量）' },
      { name: 'Math.E', signature: 'Math.E', desc: '→ num（常量）' },
    ]
  },
  {
    title: 'SceneObject 方法（Character / Background 共用）',
    subsections: [
      {
        title: '生命周期',
        rows: [
          { name: 'begin', signature: 'obj.begin(visible?: bool)', desc: '启用对象（默认 visible=true 可见）' },
          { name: 'autobegin', signature: 'obj.autobegin(visible?: bool)', desc: '启用后 50ms 自动 end() 销毁' },
          { name: 'visible', signature: 'obj.visible(able: bool, time?: num)', desc: '显示/隐藏，带 time 则渐显渐隐' },
          { name: 'end', signature: 'obj.end()', desc: '销毁释放资源' },
          { name: 'isActive', signature: 'obj.isActive() → bool', desc: '检查是否在舞台上' },
        ]
      },
      {
        title: '动图控制',
        rows: [
          { name: 'loop', signature: 'obj.loop()', desc: '循环播放动图' },
          { name: 'pause', signature: 'obj.pause()', desc: '暂停动图播放' },
          { name: 'stop', signature: 'obj.stop()', desc: '停止动图播放' },
          { name: 'speed', signature: 'obj.speed(val: num)', desc: '设置播放速度（>=0.1）' },
          { name: 'fps', signature: 'obj.fps(fps: num)', desc: '设置帧率' },
          { name: 'frame', signature: 'obj.frame(frameNum: num)', desc: '跳转到指定帧并暂停' },
        ]
      },
      {
        title: '位置与移动',
        rows: [
          { name: 'setPos', signature: 'obj.setPos(x: num, y: num, time?: num)', desc: '移动到绝对坐标' },
          { name: 'setPos', signature: 'obj.setPos(position: map, time?: num)', desc: '通过 map 定位' },
          { name: 'moveTo', signature: 'obj.moveTo(dx: num, dy: num, time?: num)', desc: '相对位移' },
          { name: 'move', signature: 'obj.move(dx: num, dy: num, duration?: num)', desc: '相对位移（链式）' },
          { name: 'moveToX', signature: 'obj.moveToX(x: num, time?: num)', desc: '单独移动 X' },
          { name: 'moveToY', signature: 'obj.moveToY(y: num, time?: num)', desc: '单独移动 Y' },
          { name: 'getPos', signature: 'obj.getPos() → map {posX, posY}', desc: '获取当前位置' },
          { name: 'getPosX', signature: 'obj.getPosX() → num', desc: '获取 X 坐标' },
          { name: 'getPosY', signature: 'obj.getPosY() → num', desc: '获取 Y 坐标' },
        ]
      },
      {
        title: '变换',
        rows: [
          { name: 'alpha', signature: 'obj.alpha(val: num, time?: num)', desc: '透明度（0~1）' },
          { name: 'scale', signature: 'obj.scale(val: num, time?: num)', desc: '缩放倍数' },
          { name: 'scaleTo', signature: 'obj.scaleTo(val: num, time?: num)', desc: '缩放到目标倍数' },
          { name: 'scaleX', signature: 'obj.scaleX(val: num, time?: num)', desc: '单独缩放 X' },
          { name: 'scaleY', signature: 'obj.scaleY(val: num, time?: num)', desc: '单独缩放 Y' },
          { name: 'scaleXTo', signature: 'obj.scaleXTo(val: num, time?: num)', desc: 'X 缩放到目标倍数' },
          { name: 'scaleYTo', signature: 'obj.scaleYTo(val: num, time?: num)', desc: 'Y 缩放到目标倍数' },
          { name: 'rotate', signature: 'obj.rotate(angle: num, time?: num)', desc: '相对旋转（度）' },
          { name: 'rotateTo', signature: 'obj.rotateTo(angle: num, time?: num)', desc: '旋转到绝对角度（度）' },
          { name: 'index', signature: 'obj.index(val: num)', desc: '设置图层（值越大越靠上）' },
          { name: 'setAlpha', signature: 'obj.setAlpha(val: num, time?: num)', desc: '直接设置透明度' },
          { name: 'setScale', signature: 'obj.setScale(val: num, time?: num)', desc: '直接设置缩放' },
          { name: 'setScale', signature: 'obj.setScale(sx: num, sy: num, time?: num)', desc: '单独设置 XY 缩放' },
          { name: 'setTint', signature: 'obj.setTint(color: num)', desc: '设置色调' },
        ]
      },
      {
        title: '滤镜效果',
        rows: [
          { name: 'blur', signature: 'obj.blur(val: num, time?: num, intensity?: num)', desc: '高斯模糊（0~2.0）' },
          { name: 'brightness', signature: 'obj.brightness(val: num, time?: num, intensity?: num)', desc: '明度（0~2.0）' },
          { name: 'contrast', signature: 'obj.contrast(val: num, time?: num, intensity?: num)', desc: '对比度（0~2.0）' },
          { name: 'saturation', signature: 'obj.saturation(val: num, time?: num, intensity?: num)', desc: '饱和度（0~2.0）' },
          { name: 'gamma', signature: 'obj.gamma(val: num, time?: num, intensity?: num)', desc: '伽马（0~10）' },
          { name: 'rgb', signature: 'obj.rgb(r: num, g: num, b: num, time?: num, intensity?: num)', desc: 'RGB 颜色滤镜（0~255）' },
          { name: 'hex', signature: 'obj.hex(h: str, time?: num, intensity?: num)', desc: '十六进制颜色滤镜' },
          { name: 'bw', signature: 'obj.bw(val: num, time?: num, intensity?: num)', desc: '黑白效果（0~1.0）' },
          { name: 'distort', signature: 'obj.distort(val: num, time?: num, intensity?: num)', desc: '失真效果' },
          { name: 'psychedelic', signature: 'obj.psychedelic(val: num, time?: num, intensity?: num)', desc: '迷幻效果' },
          { name: 'glow', signature: 'obj.glow(val: num, time?: num, intensity?: num)', desc: '发光（0~1.0）' },
          { name: 'dropShadow', signature: 'obj.dropShadow(val: num, time?: num, intensity?: num)', desc: '投影' },
          { name: 'noise', signature: 'obj.noise(val: num, time?: num, intensity?: num)', desc: '噪点（0~1.0）' },
          { name: 'clearFilters', signature: 'obj.clearFilters()', desc: '清除所有滤镜' },
        ]
      },
      {
        title: '对话',
        rows: [
          { name: 'say', signature: 'obj.say(text: str, audio?: str)', desc: '角色说话（带头像）' },
        ]
      },
    ]
  },
  {
    title: 'Audio 对象方法',
    rows: [
      { name: 'begin', signature: 'audio.begin()', desc: '单次播放' },
      { name: 'loop', signature: 'audio.loop()', desc: '循环播放' },
      { name: 'pause', signature: 'audio.pause()', desc: '暂停（可恢复）' },
      { name: 'end', signature: 'audio.end()', desc: '停止并释放资源' },
      { name: 'stop', signature: 'audio.stop()', desc: '停止播放' },
      { name: 'volume', signature: 'audio.volume(vol: num, time?: num)', desc: '音量（0~100）' },
      { name: 'speed', signature: 'audio.speed(val: num, time?: num)', desc: '播放速率（>=0.1）' },
      { name: 'isActive', signature: 'audio.isActive() → bool', desc: '是否正在播放' },
      { name: 'set', signature: 'audio.set(path: str)', desc: '动态切换音频路径' },
      { name: 'fadeOut', signature: 'audio.fadeOut()', desc: '淡出并停止' },
    ]
  },
  {
    title: 'Filter 对象方法',
    rows: [
      { name: 'begin', signature: 'filter.begin()', desc: '应用滤镜到舞台' },
      { name: 'end', signature: 'filter.end()', desc: '从舞台移除滤镜' },
      { name: 'intensity', signature: 'filter.intensity(val: num, time?: num)', desc: '全局滤镜强度（0~1）' },
      { name: 'rgb', signature: 'filter.rgb(r: num, g: num, b: num, time?: num, intensity?: num)', desc: 'RGB 颜色滤镜（0~255）' },
      { name: 'hex', signature: 'filter.hex(h: str, time?: num, intensity?: num)', desc: '十六进制颜色滤镜' },
      { name: 'blur', signature: 'filter.blur(val: num, time?: num, intensity?: num)', desc: '高斯模糊（0~2.0）' },
      { name: 'brightness', signature: 'filter.brightness(val: num, time?: num, intensity?: num)', desc: '明度（0~2.0）' },
      { name: 'contrast', signature: 'filter.contrast(val: num, time?: num, intensity?: num)', desc: '对比度（0~2.0）' },
      { name: 'saturation', signature: 'filter.saturation(val: num, time?: num, intensity?: num)', desc: '饱和度（0~2.0）' },
      { name: 'gamma', signature: 'filter.gamma(val: num, time?: num, intensity?: num)', desc: '伽马（0~10）' },
      { name: 'bw', signature: 'filter.bw(val: num, time?: num, intensity?: num)', desc: '黑白效果（0~1.0）' },
      { name: 'distort', signature: 'filter.distort(val: num, time?: num, intensity?: num)', desc: '失真效果' },
      { name: 'psychedelic', signature: 'filter.psychedelic(val: num, time?: num, intensity?: num)', desc: '迷幻效果' },
      { name: 'glow', signature: 'filter.glow(val: num)', desc: '发光（0~1.0）' },
      { name: 'dropShadow', signature: 'filter.dropShadow(val: num)', desc: '投影' },
      { name: 'noise', signature: 'filter.noise(val: num)', desc: '噪点（0~1.0）' },
    ]
  },
  {
    title: '核心语法关键字',
    rows: [
      { name: 'let', signature: 'let name = value / let name: type = value / let name?', desc: '变量声明' },
      { name: 'if', signature: 'if (condition) { ... } else if { ... } else { ... }', desc: '条件判断' },
      { name: 'while', signature: 'while (condition) { ... }', desc: '循环' },
      { name: 'choice', signature: 'choice { case "text" { ... } case "text" { ... } }', desc: '分支选择' },
      { name: 'async', signature: 'async { ... } / async(time: num) { ... }', desc: '异步并发块' },
      { name: 'function', signature: 'function name(args): retType? { ... }', desc: '函数定义' },
      { name: 'ObjectFunction', signature: 'ObjectFunction Type::name(obj, args) { ... }', desc: '对象函数定义' },
      { name: 'return', signature: 'return expr', desc: '返回值' },
      { name: 'arr', signature: 'arr name = {val1, val2, ...} / arr:num = {1, 2, 3}', desc: '数组' },
      { name: 'map', signature: 'map name = { key: type = value; ... }', desc: '映射' },
    ]
  },
]

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 13,
  marginBottom: 20,
}

const thStyle: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,0.12)',
  padding: '6px 10px',
  textAlign: 'left',
  background: 'rgba(255,255,255,0.06)',
  fontWeight: 600,
  color: '#89b4fa',
  whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,0.08)',
  padding: '5px 10px',
  verticalAlign: 'top',
  color: '#cdd6f4',
  fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", monospace',
  fontSize: 12,
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  color: '#f5c2e7',
  margin: '20px 0 8px 0',
  paddingBottom: 4,
  borderBottom: '2px solid rgba(245,194,231,0.3)',
}

const subsectionTitleStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: '#a6e3a1',
  margin: '12px 0 6px 0',
}

function ApiTableSection({ section }: { section: ApiSection }): JSX.Element {
  const columns = section.title === '全局工厂方法' || section.title === 'Math 对象'
    ? ['名称', '签名', '返回类型']
    : ['名称', '签名', '说明']

  if (section.subsections) {
    return (
      <div>
        <div style={sectionTitleStyle}>{section.title}</div>
        {section.subsections.map((sub) => (
          <div key={sub.title}>
            <div style={subsectionTitleStyle}>{sub.title}</div>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, width: '14%' }}>名称</th>
                  <th style={{ ...thStyle, width: '52%' }}>签名</th>
                  <th style={thStyle}>说明</th>
                </tr>
              </thead>
              <tbody>
                {sub.rows.map((row, i) => (
                  <tr key={i}>
                    <td style={{ ...tdStyle, color: '#f9e2af', fontWeight: 500 }}>{row.name}</td>
                    <td style={tdStyle}>{row.signature}</td>
                    <td style={tdStyle}>{row.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div>
      <div style={sectionTitleStyle}>{section.title}</div>
      <table style={tableStyle}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col} style={{ ...thStyle, width: col === '名称' ? '14%' : col === '签名' ? '52%' : undefined }}>
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {section.rows!.map((row, i) => (
            <tr key={i}>
              <td style={{ ...tdStyle, color: '#f9e2af', fontWeight: 500 }}>{row.name}</td>
              <td style={tdStyle}>{row.signature}</td>
              <td style={tdStyle}>{row.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ApiTable(): JSX.Element {
  return (
    <div>
      {API_SECTIONS.map((section, i) => (
        <ApiTableSection key={i} section={section} />
      ))}
    </div>
  )
}

// ─── HelpPanel 组件 ───

export function HelpPanel({ onBack }: { onBack: () => void }): JSX.Element {
  const [docMode, setDocMode] = useState<'simple' | 'deep' | 'table'>('simple')
  const docs = docMode === 'simple' ? SIMPLE_DOCS : docMode === 'deep' ? DEEP_DOCS : []
  const [activeCategory, setActiveCategory] = useState(docs.length > 0 ? docs[0].id : '')
  const [activeItem, setActiveItem] = useState(docs.length > 0 ? docs[0].items[0].id : '')

  const category = docs.length > 0 ? (docs.find((c) => c.id === activeCategory) ?? docs[0]) : null
  const item = category && (category.items.find((i) => i.id === activeItem) ?? category.items[0])
  const content = item?.content ?? []

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.headerTitle}>Udseen 帮助</div>
        <div style={styles.headerRight}>
          <div style={styles.modeSwitch}>
            <button
              onClick={() => {
                setDocMode('simple')
                setActiveCategory(SIMPLE_DOCS[0].id)
                setActiveItem(SIMPLE_DOCS[0].items[0].id)
              }}
              style={{
                ...styles.modeBtn,
                ...(docMode === 'simple' ? styles.modeBtnActive : {})
              }}
            >
              创作者指南
            </button>
            <button
              onClick={() => {
                setDocMode('deep')
                setActiveCategory(DEEP_DOCS[0].id)
                setActiveItem(DEEP_DOCS[0].items[0].id)
              }}
              style={{
                ...styles.modeBtn,
                ...(docMode === 'deep' ? styles.modeBtnActive : {})
              }}
            >
              API 参考
            </button>
            <button
              onClick={() => {
                setDocMode('table')
              }}
              style={{
                ...styles.modeBtn,
                ...(docMode === 'table' ? styles.modeBtnActive : {})
              }}
            >
              API 总表
            </button>
          </div>
          <button onClick={onBack} style={styles.backBtn}>返回</button>
        </div>
      </div>

      <div style={styles.body}>
        {docMode === 'table' ? (
          <div style={styles.contentArea}>
            <div style={styles.contentTitle}>API 总表</div>
            <div style={{ ...styles.contentBody, overflow: 'auto' }}>
              <ApiTable />
            </div>
          </div>
        ) : (
          <>
            <div style={styles.sidebar}>
              {docs.map((cat) => (
                <div key={cat.id}>
                  <div style={styles.categoryLabel}>{cat.label}</div>
                  {cat.items.map((it) => (
                    <div
                      key={it.id}
                      onClick={() => {
                        setActiveCategory(cat.id)
                        setActiveItem(it.id)
                      }}
                      style={{
                        ...styles.sidebarItem,
                        ...(activeItem === it.id && activeCategory === cat.id
                          ? styles.sidebarItemActive
                          : {})
                      }}
                    >
                      {it.title}
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <div style={styles.contentArea}>
              <div style={styles.contentTitle}>{item?.title ?? ''}</div>
              <div style={styles.contentBody}>
                {content.map((line, i) => {
                  if (line === '') return <br key={i} />
                  return (
                    <div key={i} style={styles.contentLine}>
                      {line}
                    </div>
                  )
                })}
              </div>
              {docMode === 'simple' && (
                <div style={styles.tip}>
                  💡 需要详细的 API 参考？请切换到「API 参考」模式
                </div>
              )}
              {docMode === 'deep' && (
                <div style={styles.tip}>
                  💡 我是零基础创作者？请切换到「创作者指南」模式
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}


// ─── 样式 ───

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: '#1a1a2e',
    color: '#cdd6f4',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    overflow: 'hidden'
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 20px',
    background: '#252540',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    flexShrink: 0
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: '#cdd6f4',
    letterSpacing: 0.5
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 12
  },
  modeSwitch: {
    display: 'flex',
    background: '#1e1e32',
    borderRadius: 8,
    padding: 2,
    gap: 2
  },
  modeBtn: {
    padding: '6px 16px',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 13,
    background: 'transparent',
    color: '#888',
    transition: 'all 0.15s'
  },
  modeBtnActive: {
    background: '#7c6ff0',
    color: '#fff',
    fontWeight: 600
  },
  backBtn: {
    padding: '6px 20px',
    background: '#3a3a5a',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#cdd6f4',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 13
  },
  body: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden'
  },
  sidebar: {
    width: 220,
    flexShrink: 0,
    background: '#1e1e32',
    borderRight: '1px solid rgba(255,255,255,0.06)',
    overflowY: 'auto',
    padding: '8px 0'
  },
  categoryLabel: {
    padding: '10px 16px 4px',
    fontSize: 11,
    color: '#667',
    fontWeight: 600,
    letterSpacing: 1,
    textTransform: 'uppercase'
  },
  sidebarItem: {
    padding: '6px 16px 6px 24px',
    cursor: 'pointer',
    fontSize: 13,
    color: '#999',
    borderLeft: '3px solid transparent',
    transition: 'all 0.15s'
  },
  sidebarItemActive: {
    color: '#fff',
    background: 'rgba(124,111,240,0.15)',
    borderLeftColor: '#7c6ff0'
  },
  contentArea: {
    flex: 1,
    overflowY: 'auto',
    padding: '24px 32px'
  },
  contentTitle: {
    fontSize: 22,
    fontWeight: 700,
    color: '#e0e0f0',
    marginBottom: 20,
    paddingBottom: 12,
    borderBottom: '1px solid rgba(255,255,255,0.06)'
  },
  contentBody: {
    fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
    fontSize: 14,
    lineHeight: 1.7,
    color: '#c0c8e0'
  },
  contentLine: {
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word'
  },
  tip: {
    marginTop: 32,
    padding: '12px 16px',
    background: 'rgba(124,111,240,0.1)',
    border: '1px solid rgba(124,111,240,0.25)',
    borderRadius: 8,
    fontSize: 13,
    color: '#aab0d0',
    lineHeight: 1.5
  }
}
