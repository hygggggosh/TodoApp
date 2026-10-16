import Foundation

struct Task: Identifiable, Codable, Equatable {
    var id = UUID()
    var title: String
    var note: String = ""
    var isDone: Bool = false
    var createdAt: Date = Date()
}
