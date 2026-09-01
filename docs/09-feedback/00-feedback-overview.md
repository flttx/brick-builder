# Feedback 总览

FeedbackOrchestrator 监听 Engine Events，统一触发 Animation、Audio、Haptics。任何反馈失败都不能修改 Engine State。

体验优先级：Magnet Movement > Snap Press > Detach Resistance > Contact Shadow > Audio > Haptics > Bucket Physics。
