# Consolidate Linux Compatibility Coordinator

The Linux compatibility layer was fragmented across five shallow modules with overlapping monkey-patches, synchronous main-thread file I/O, and duplicated renderer logs. We consolidated these shallow files into a single, deep Compatibility Coordinator (`linux-compat/index.js`) providing an asynchronous non-blocking diagnostic stream, unified path normalization, and clean exception resilience behind one initialization seam.
