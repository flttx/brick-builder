# Debug Tools

开发模式必须能显示：

- FPS / frame / draw calls / triangles
- Connector
- Collider / AABB
- Snap candidates / score / selected candidate
- Connection Graph / Occupancy
- Render Batch / slot mapping
- Asset state/refCount/hash
- Client/Server/Draft revision

还应提供 Fault Injection：failNextAssetLoad、failNextCloudSave、loseWebGLContext、simulateConflict 等。
