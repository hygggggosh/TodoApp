import SwiftUI

struct TaskRow: View {
    let task: Task
    let onToggle: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: task.isDone ? "checkmark.circle.fill" : "circle")
                .font(.title3)
                .foregroundStyle(task.isDone ? Color.accentColor : Color.secondary)
                .onTapGesture(perform: onToggle)

            VStack(alignment: .leading, spacing: 4) {
                Text(task.title)
                    .strikethrough(task.isDone, color: .secondary)

                if !task.note.isEmpty {
                    Text(task.note)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
        }
        .padding(.vertical, 2)
    }
}
