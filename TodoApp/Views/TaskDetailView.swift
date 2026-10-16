import SwiftUI

struct TaskDetailView: View {
    @EnvironmentObject private var store: TaskStore
    let taskID: UUID

    var body: some View {
        Form {
            if let task = store.tasks.first(where: { $0.id == taskID }) {
                Section("标题") {
                    TextField("标题", text: stringBinding(\.title, of: task))
                }
                Section("备注") {
                    TextEditor(text: stringBinding(\.note, of: task))
                        .frame(minHeight: 120)
                }
                Section("状态") {
                    Toggle("已完成", isOn: doneBinding(of: task))
                    LabeledContent("创建时间", value: task.createdAt.formatted(date: .long, time: .shortened))
                }
            } else {
                VStack(spacing: 8) {
                    Image(systemName: "questionmark.circle")
                        .font(.largeTitle)
                        .foregroundStyle(.secondary)
                    Text("任务不存在或已被删除")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .navigationTitle("任务详情")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func stringBinding(
        _ keyPath: WritableKeyPath<Task, String>,
        of task: Task
    ) -> Binding<String> {
        Binding {
            store.tasks.first { $0.id == taskID }?[keyPath: keyPath] ?? ""
        } set: { newValue in
            var updated = task
            updated[keyPath: keyPath] = newValue
            store.update(updated)
        }
    }

    private func doneBinding(of task: Task) -> Binding<Bool> {
        Binding {
            store.tasks.first { $0.id == taskID }?.isDone ?? false
        } set: { _ in
            store.toggle(task)
        }
    }
}
