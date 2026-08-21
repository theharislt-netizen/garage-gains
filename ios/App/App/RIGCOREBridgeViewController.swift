import UIKit
import Capacitor

class RIGCOREBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(BackupImportPlugin())
    }
}
