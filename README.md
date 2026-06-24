# Time Grid - Obsidian 插件

极简主义的时间管理与可视化工具 - 向死而生 (Memento Mori)

## 功能特性

- **活动热力图**：显示在顶部，借鉴 Keep the Rhythm 的贡献图式热力图，支持「字数 / 时间」双模式与「3个月 / 6个月 / 1年」范围切换；字数模式统计启用后全库 Markdown 的每日新增字数，时间模式读取日记中的 `simple-time-tracker`
- **本月日历**：保留原来的当月日期网格，过去日期为深色，当前日期红色轮廓高亮
- **24H 网格**：24 个方块代表一天的小时，实时显示当前小时
- **60m 网格**：60 个小方块代表当前小时的分钟，显示实时时间
- **今日计时分布**：读取当天日记中的 `simple-time-tracker` 代码块，汇总并展示今日时间分布

## 安装方法

### 方法一：手动安装（推荐）

1. 找到你的 Obsidian vault 目录（通常是你的笔记文件夹）
2. 在 vault 目录下找到 `.obsidian/plugins/` 文件夹（如果不存在则创建）
3. 将整个 `TimeGrid` 项目文件夹复制到 `.obsidian/plugins/time-grid/` 目录
4. 确保以下文件存在于插件目录：
   - `main.js`
   - `manifest.json`
   - `styles.css`（如果有）
5. 打开 Obsidian，进入 设置 → 第三方插件 → 已安装插件
6. 找到 "Time Grid" 并启用

### 方法二：使用安装脚本

运行以下命令（需要替换 `YOUR_VAULT_PATH` 为你的实际 vault 路径）：

```bash
./install.sh YOUR_VAULT_PATH
```

## 开发

```bash
# 安装依赖
npm install

# 构建插件
npm run build

# 开发模式（自动监听文件变化）
npm run dev
```

## 项目结构

```
TimeGrid/
├── manifest.json          # 插件清单
├── main.js               # 编译后的插件入口
├── package.json           # 依赖配置
├── src/                   # 源代码
│   ├── main.ts           # 插件入口
│   ├── views/            # 视图组件
│   ├── components/       # UI 组件
│   ├── utils/            # 日记与计时数据解析
│   └── styles/           # 样式定义
└── node_modules/          # 依赖包
```

## 注意事项

- 插件会在 Obsidian 右侧面板自动显示
- 时间每秒钟自动更新一次
- 活动热力图的字数模式从启用后开始建立全库 Markdown 基线，不回填历史新增字数
- 活动热力图的时间模式与今日计时分布依赖 Obsidian 核心「日记」插件与日记中的 `simple-time-tracker` 代码块
- 无需任何配置，安装后即可使用
