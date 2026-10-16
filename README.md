# TodoApp（我的清单）

一个用 SwiftUI 编写的待办清单 iOS 应用，功能包含：

- 任务列表（新增 / 删除 / 划线标记完成）
- 任务详情编辑（标题、备注、完成状态）
- 数据通过 `UserDefaults` + JSON 自动持久化，重启不丢失
- 支持 iOS 16+，深色模式自动适配

## 目录结构

```
TodoApp/
├── project.yml              # XcodeGen 工程配置
└── TodoApp/
    ├── TodoAppApp.swift     # App 入口
    ├── Models/
    │   ├── Task.swift       # 数据模型
    │   └── TaskStore.swift  # 状态管理与持久化
    ├── Views/
    │   ├── ContentView.swift     # 主列表页
    │   ├── TaskRow.swift         # 单行任务视图
    │   ├── AddTaskView.swift     # 新建任务弹窗
    │   └── TaskDetailView.swift  # 任务详情编辑页
    └── Assets.xcassets/     # 颜色 / 图标资源
```

## 构建步骤

### 1. 安装完整版 Xcode（必须）

从 **App Store** 或 https://developer.apple.com/download 安装 Xcode（约 7~12GB），
安装完成后**打开一次 Xcode**，在弹出窗口中接受许可协议并勾选安装 iOS 平台组件。

> 可以在 Xcode → Settings → Components 里确认 "iOS Simulator" 已安装。

### 2. 生成 Xcode 工程

本仓库用 [XcodeGen](https://github.com/yonaskolb/XcodeGen) 管理工程，无需手点配置：

```bash
brew install xcodegen
cd TodoApp
xcodegen generate
```

会在当前目录生成 `TodoApp.xcodeproj`。

### 3. 运行

```bash
# 方式一：打开工程，在 Xcode 里选 iPhone 模拟器后按 Cmd+R
open TodoApp.xcodeproj

# 方式二：命令行直接构建
xcodebuild -project TodoApp.xcodeproj -scheme TodoApp \
  -destination 'platform=iOS Simulator,name=iPhone 16' build

# 方式三：命令行构建并启动模拟器
xcrun simctl boot "iPhone 16" 2>/dev/null; open -a Simulator
xcodebuild -project TodoApp.xcodeproj -scheme TodoApp \
  -destination 'platform=iOS Simulator,name=iPhone 16' build
xcrun simctl install booted build/Build/Products/Debug-iphonesimulator/TodoApp.app
xcrun simctl launch booted com.demo.TodoApp
```

（模拟器机型名以本机 `xcrun simctl list devices available` 输出为准）

## 修改工程

新增 Swift 文件只需要放进 `TodoApp/` 目录，然后重新执行 `xcodegen generate` 即可，
`project.yml` 是工程的唯一事实来源，不要手动改生成的 `.xcodeproj`。
