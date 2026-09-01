# Audio

AudioManager 使用 Web Audio API，预加载短音效 Buffer，播放时创建 BufferSource。

V1 Sound IDs：bucket_shake、brick_rattle、brick_pick、snap_soft、snap_medium、snap_strong、detach、brick_drop、delete。

Snap Sound 可按 matchedPairs 分级，并做轻微 pitch/volume randomization，避免连续 click 完全机械重复。
