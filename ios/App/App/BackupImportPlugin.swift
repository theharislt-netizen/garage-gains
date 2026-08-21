import Foundation
import UniformTypeIdentifiers
import UIKit
import Capacitor

@objc(BackupImportPlugin)
public class BackupImportPlugin: CAPPlugin, CAPBridgedPlugin, UIDocumentPickerDelegate {
    public let identifier = "BackupImportPlugin"
    public let jsName = "BackupImport"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "pickBackup", returnType: CAPPluginReturnPromise)
    ]

    private var pendingCall: CAPPluginCall?
    private let maxBytes = 8 * 1024 * 1024

    @objc func pickBackup(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.pendingCall = call
            let types: [UTType] = [.json, .text, .plainText, .data, .item]
            let picker = UIDocumentPickerViewController(forOpeningContentTypes: types, asCopy: true)
            picker.delegate = self
            picker.allowsMultipleSelection = false
            picker.modalPresentationStyle = .formSheet
            self.bridge?.viewController?.present(picker, animated: true)
        }
    }

    public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let url = urls.first else {
            pendingCall?.resolve(["canceled": true])
            pendingCall = nil
            return
        }
        let accessed = url.startAccessingSecurityScopedResource()
        defer {
            if accessed { url.stopAccessingSecurityScopedResource() }
        }
        do {
            let data = try Data(contentsOf: url)
            if data.count > maxBytes {
                pendingCall?.reject("Backup file is too large")
            } else {
                pendingCall?.resolve(["canceled": false, "text": decodeText(data)])
            }
        } catch {
            pendingCall?.reject("Could not read backup: \(error.localizedDescription)")
        }
        pendingCall = nil
    }

    public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        pendingCall?.resolve(["canceled": true])
        pendingCall = nil
    }

    private func decodeText(_ data: Data) -> String {
        if data.count >= 2 {
            if data[0] == 0xFF && data[1] == 0xFE {
                return String(data: data, encoding: .utf16LittleEndian) ?? ""
            }
            if data[0] == 0xFE && data[1] == 0xFF {
                return String(data: data, encoding: .utf16BigEndian) ?? ""
            }
        }
        return String(data: data, encoding: .utf8) ?? String(decoding: data, as: UTF8.self)
    }
}
