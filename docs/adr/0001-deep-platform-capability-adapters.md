# Deep Platform Capability Adapters for Linux

On Linux, compiled Windows/macOS C++ binary addons in `nativelibs` cannot run directly. Instead of using shallow empty stubs that violate caller contracts, we implement deep POSIX-compliant adapters using Node.js standard libraries (`fs.statfsSync`, `fs.accessSync`, `fs.promises`, `Proxy`) and safe Null Object returns. This preserves contract invariants across Main, Worker, and Renderer processes without modifying minified application bundles.
