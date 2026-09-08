# 显式已有工作台：剪口播、字幕、导出

先完整读取[共享接入规则](plugin-access.md)，按实际工具命名空间调用短工具名。
用户指定已有服务时优先使用本路线，整轮保持同一connection与projectId。
`runtime_connect({endpoint})`返回的PID/build/version/mode全部原样携带；业务工具要求
服务`existingWorkflowApiVersion=1`。旧服务报capability_missing即停止，不调用
canonical 5190、service ensure、旧runtime_cli或源码CLI兜底，不复制项目注册。
此门证明本地开发接入，不是release ready；身份变化重新连接、读取和审核。

## 剪口播（已有转录项目）

1. `runtime_project`读取workflow、cuts、edit-list，分别保存revision。
2. `runtime_playback`以limit=64串行翻页直到nextCursor=null；透传cursor，保持
   transcriptRevision/editListRevision一致。Skill仍负责语义五轮扫描和两张表，不能
   把接入能力当成语义判断，也不把每轮局部提案分别提交。
3. 当前任务明确授权删词后，`runtime_cuts_put`传完整cutWordIds/reasons、原cuts
   expectedRevision、新operationId、confirmed=true；语义模式由工具固定。确认布尔值
   不是授权令牌。一次CAS后读回workflow、cuts、edit-list；冲突整轮重读，不偷换revision。
4. 审核URL只用该connection.endpoint加项目hash，绑定projectId和当前revision，
   不调用旧open/ensure。实际用户复核与最终交棒纪律不变。

## 新 WAV 建档与修字（仅新能力服务）

先核对同一服务 `features.ingestApiVersion=1`，旧服务缺能力仍停止，不报 Plugin 未安装，
不重装、不切 Runtime、不调用源码 CLI。视频新建仍不在此显式连接入口范围内。
用户授权云 ASR 费用后调用 `runtime_ingest_start({connection,operationId,sourcePath,
expectedSourceSha256,taskDirectory,language?,aspectRatio?,confirmed:true})`。sourcePath 是真实
WAV 绝对路径；taskDirectory 是既有真实任务目录，可以有 source.wav、README，但不能有
受管 Product 输出或注册冲突。源在任务目录内也可复用；源 SHA256 与目标
共同绑定本次授权；不发送凭据、不预写逐词稿、不覆盖项目。language 最长32字符；画幅仅
16:9、9:16、1:1、4:3、3:4。开始只返回受理状态，不证明转录成功。
使用 `runtime_ingest_status({connection,operationId})` 精确轮询同一操作；结果不确定只查
原 operationId，不生成新 ID 重复收费。interrupted/failed 先核验，不盲重试。
succeeded 后核对 result.projectId/sourceSha256/registered，再读 workflow、cuts、edit-list。

修字需 `features.transcriptCorrectionApiVersion=1`：词典与上下文产生修字表后调用
`runtime_transcript_correct({connection,projectId,operationId,expectedRevision,
corrections:[{wordId,text}],confirmed:true})`，revision 必须来自本轮 transcriptRevision。
每次1..500条，每条text最多1000字符，不重复wordId；只改文字，不改时间/词ID/原音频。
核对回执 previousRevision/revision、subtitleScreensUpdated、subtitleNeedsAttentionCount，
存在字幕待复核时如实报告，再重读分页稿及 workflow。未知提交保留完全相同
operationId与输入做幂等查回；CAS冲突停止重读，不偷换revision。五轮扫描、两张表和人工审核不变。

## 字幕

1. `runtime_project`读取subtitles当前revision和review；`runtime_subtitle_inputs`
   仅把同源锁内读取的transcript/EDL/已有字幕原始字节放到新的系统临时输入目录，返回路径。
   不把海量逐词稿塞进上下文，不重新序列化冒充原始SHA。
2. 运行本字幕Skill已有candidate.mjs generate与validate（见其isolated-candidate.md），
   用返回的输入文件；有subtitles.json时两步都传--reviewed-subtitles。输出到新的候选目录，
   不嵌套于输入目录，不覆盖活动结果。保留人工修字和分屏；不调用付费转录。
3. 用户已授权提交且候选校验通过后，`runtime_subtitle_submit`携带同connection/projectId、
   candidateDirectory、原subtitles expectedRevision及confirmed=true。Runtime核验receipt、
   输入SHA和活动结果CAS，保存后GET回读。任何不确定提交先读当前subtitles，不自动重试。
4. 在同服务审核字幕；API通过不代表人已听看或已烧进MP4。

## 导出

1. `runtime_export_plan`传明确profile=fast/master，报告时长/帧数/字幕/层数/尺寸和warnings。
   保存snapshotFingerprint、profile与拟定绝对输出路径。计划尚未产出文件。
2. 用户明确确认这份计划后，`runtime_export_start`传同profile、新outputPath、operationId、
   原snapshotFingerprint作为expectedSnapshot、confirmed=true。服务在项目锁内检查文档
   快照再进入原durable队列；文档变更拒绝重新审核。已有输出绝不覆盖。
   此指纹绑定项目相关 JSON，不承诺绑定 HTML 或媒体文件的全部字节。
3. `runtime_export_job`携带同projectId和jobId查询；请求响应丢失时省略jobId，
   传原operationId精确查回；两者都省略才是最近10个导出的辅助列表，不能作为未知提交恢复依据。
   只有明确取消授权才传cancel=true/confirmed=true。
   admission状态不确定先查询，不换operationId盲目重跑。
4. succeeded后比对计划与result时长/帧/音轨/problems；实际成片像素、人耳听感分开验收。
   Runtime已有保护不因本路线放宽；分数帧readback_mismatch仍是失败，不报成片完成。

画面 Skill 另有受限 runtime_module_publish/get（需要 modulePublishApiVersion=1），
不等于任意模块上传。任意HTTP/本机文件读写、换源、安装/重启不属于这些业务工具。
