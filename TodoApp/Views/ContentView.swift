import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var store: TaskStore
    @State private var showAddTask = false

    var body: some View {
        NavigationStack {
            Group {
                if store.tasks.isEmpty {
                    emptyState
                } else {
                    taskList
                }
            }
            .navigationTitle("我的清单")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        showAddTask = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showAddTask) {
                AddTaskView()
            }
        }
    }

    private var taskList: some View {
        List {
            ForEach(store.tasks) { task in
                NavigationLink(value: task.id) {
                    TaskRow(task: task) {
                        store.toggle(task)
                    }
                }
            }
            .onDelete(perform: store.remove)
        }
        .navigationDestination(for: UUID.self) { id in
            TaskDetailView(taskID: id)
        }
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "checklist")
                .font(.system(size: 48))
                .foregroundStyle(.secondary)
            Text("还没有任务")
                .font(.headline)
            Text("点击右上角 + 添加第一个任务")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

#Preview {
    ContentView()
        .environmentObject(TaskStore())
}
