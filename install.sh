#!/bin/bash

# Time Grid 插件安装脚本

if [ -z "$1" ]; then
    echo "用法: ./install.sh <Obsidian_Vault_Path>"
    echo "示例: ./install.sh ~/Documents/MyVault"
    exit 1
fi

VAULT_PATH="$1"
PLUGIN_DIR="$VAULT_PATH/.obsidian/plugins/time-grid"
CURRENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 检查 vault 目录是否存在
if [ ! -d "$VAULT_PATH" ]; then
    echo "错误: Vault 目录不存在: $VAULT_PATH"
    exit 1
fi

# 检查 .obsidian 目录
if [ ! -d "$VAULT_PATH/.obsidian" ]; then
    echo "警告: 未找到 .obsidian 目录，将创建..."
    mkdir -p "$VAULT_PATH/.obsidian/plugins"
fi

# 创建插件目录
echo "创建插件目录: $PLUGIN_DIR"
mkdir -p "$PLUGIN_DIR"

# 复制必要文件
echo "复制插件文件..."
cp "$CURRENT_DIR/main.js" "$PLUGIN_DIR/"
cp "$CURRENT_DIR/manifest.json" "$PLUGIN_DIR/"
if [ -f "$CURRENT_DIR/styles.css" ]; then
	cp "$CURRENT_DIR/styles.css" "$PLUGIN_DIR/"
elif [ -f "$CURRENT_DIR/src/styles/main.css" ]; then
	cp "$CURRENT_DIR/src/styles/main.css" "$PLUGIN_DIR/styles.css"
fi

# 检查文件是否复制成功
if [ -f "$PLUGIN_DIR/main.js" ] && [ -f "$PLUGIN_DIR/manifest.json" ]; then
    echo "✅ 插件安装成功！"
    echo ""
    echo "下一步："
    echo "1. 打开 Obsidian"
    echo "2. 进入 设置 → 第三方插件"
    echo "3. 关闭安全模式（如果启用）"
    echo "4. 在已安装插件列表中找到 'Time Grid' 并启用"
else
    echo "❌ 安装失败，请检查文件权限"
    exit 1
fi
