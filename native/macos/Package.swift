// swift-tools-version: 5.10
import PackageDescription

let package = Package(
    name: "KeepDirMac",
    platforms: [.macOS(.v13)],
    products: [
        .library(name: "KeepDirCore", targets: ["KeepDirCore"]),
        .executable(name: "KeepDirMacApp", targets: ["KeepDirMacApp"])
    ],
    targets: [
        .target(name: "KeepDirCore"),
        .executableTarget(name: "KeepDirMacApp", dependencies: ["KeepDirCore"], resources: [
            .copy("Resources/PlusJakartaSans.ttf"),
            .copy("Resources/JetBrainsMono.ttf"),
            .copy("Resources/icon.png"),
            .copy("Resources/icon.svg")
        ]),
        .testTarget(name: "KeepDirCoreTests", dependencies: ["KeepDirCore"])
    ]
)
