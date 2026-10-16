import Foundation

@MainActor
final class TaskStore: ObservableObject {
    @Published private(set) var tasks: [Task] = []

    private static let storageKey = "TodoApp.tasks"

    init() {
        load()
    }

    func add(title: String, note: String) {
        let cleanTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanTitle.isEmpty else { return }
        tasks.insert(Task(title: cleanTitle, note: note), at: 0)
        save()
    }

    func update(_ task: Task) {
        guard let index = tasks.firstIndex(where: { $0.id == task.id }) else { return }
        tasks[index] = task
        save()
    }

    func toggle(_ task: Task) {
        var updated = task
        updated.isDone.toggle()
        update(updated)
    }

    func remove(at offsets: IndexSet) {
        tasks.remove(atOffsets: offsets)
        save()
    }

    private func load() {
        guard let data = UserDefaults.standard.data(forKey: Self.storageKey),
              let saved = try? JSONDecoder().decode([Task].self, from: data) else { return }
        tasks = saved
    }

    private func save() {
        guard let data = try? JSONEncoder().encode(tasks) else { return }
        UserDefaults.standard.set(data, forKey: Self.storageKey)
    }
}
