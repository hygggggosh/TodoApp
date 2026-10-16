import SwiftUI

struct AddTaskView: View {
    @EnvironmentObject private var store: TaskStore
    @Environment(\.dismiss) private var dismiss

    @State private var title = ""
    @State private var note = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("任务") {
                    TextField("要做什么？", text: $title)
                }
                Section("备注") {
                    TextEditor(text: $note)
                        .frame(minHeight: 100)
                }
            }
            .navigationTitle("新建任务")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("保存") {
                        store.add(title: title, note: note)
                        dismiss()
                    }
                    .disabled(title.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}
