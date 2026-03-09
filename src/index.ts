import { Context, Schema } from 'koishi'
import { spawn, ChildProcess, exec } from 'child_process'
import * as fs from 'fs'
import { TextDecoder } from 'util'

// 指令配置：各条 Koishi 指令的触发词
export interface CommandConfig {
  setServer: string
  startServer: string
  stopServer: string
  sudo: string
  say: string
  list: string
  killServer: string
}

// 发送到所有允许群聊的广播消息
export interface BroadcastConfig {
  mcChat: string
  stopByUser: string
  stopUnexpectedly: string
}

// 多个命令复用的通用返回消息
export interface CommonResponseConfig {
  noControlPermission: string
  pathUnavailable: string
  serverNotRunning: string
  killFailed: string
}

// 切换服务端命令的返回消息
export interface SetServerResponseConfig {
  runningBlocked: string
  invalidName: string
  success: string
}

// 开服命令的返回消息
export interface StartServerResponseConfig {
  alreadyRunning: string
  starting: string
  noServerSelected: string
  startFailed: string
  startAccepted: string
}

// 关服命令的返回消息
export interface StopServerResponseConfig {
  stopCommandSent: string
  forceKilling: string
  stopFailed: string
}

// sudo 命令的返回消息
export interface SudoResponseConfig {
  emptyCommand: string
  noOutput: string
  sendFailed: string
}

// say 命令的返回消息
export interface SayResponseConfig {
  noPermission: string
  emptyContent: string
  sendFailed: string
}

// list 命令的返回消息
export interface ListResponseConfig {
  noOutput: string
  queryFailed: string
}

// 强制终止命令的返回消息
export interface KillServerResponseConfig {
  killSuccess: string
}

// 返回消息总配置：common 用于复用，其余按命令拆分
export interface ResponseConfig {
  common: CommonResponseConfig
  setServer: SetServerResponseConfig
  startServer: StartServerResponseConfig
  stopServer: StopServerResponseConfig
  sudo: SudoResponseConfig
  say: SayResponseConfig
  list: ListResponseConfig
  killServer: KillServerResponseConfig
}

// 插件主配置：包含服务端路径、权限、广播消息、命令回复消息和指令触发词
export interface Config {
  serverPaths: Record<string, string>
  batName: string
  allowedGroups: string[]
  adminIds: string[]
  runtime: 'windows' | 'linux'
  encoding: 'utf-8' | 'gbk'
  injectMcChatToKoishi: boolean
  injectTargetGroup: string
  llmPrefix: string
  llmBotIds: string[]
  commands: CommandConfig
  broadcasts: BroadcastConfig
  responses: ResponseConfig
}

// 指令配置 Schema
const CommandConfigSchema: Schema<CommandConfig> = Schema.object({
  setServer: Schema.string().default('setserver').description('切换服务器指令'),
  startServer: Schema.string().default('开服').description('启动服务器指令'),
  stopServer: Schema.string().default('关服').description('关闭服务器指令'),
  sudo: Schema.string().default('sudo').description('发送控制台命令指令'),
  say: Schema.string().default('say').description('发送消息指令'),
  list: Schema.string().default('list').description('查询在线玩家指令'),
  killServer: Schema.string().default('杀死服务器进程').description('强制终止服务器指令'),
}).description('指令配置')

// 广播消息 Schema
const BroadcastConfigSchema: Schema<BroadcastConfig> = Schema.object({
  mcChat: Schema.string().default('[MC] {player}: {message}').description('MC 聊天转发到群聊的广播模板'),
  stopByUser: Schema.string().default('服务器似了啦，都你害的').description('主动关服时的群聊广播'),
  stopUnexpectedly: Schema.string().default('哎......服务器怎么寄了~').description('服务端非预期退出时的群聊广播'),
}).description('广播到所有群聊的消息配置')

// 指令返回消息 Schema
const ResponseConfigSchema: Schema<ResponseConfig> = Schema.object({
  common: Schema.object({
    noControlPermission: Schema.string().default('你没有控制服务器的权限！').description('无控制权限时的提示'),
    pathUnavailable: Schema.string().default('服务器路径"{path}"不可用！').description('服务端路径不可用时的提示'),
    serverNotRunning: Schema.string().default('服务器没开呢~').description('服务器未运行时的提示'),
    killFailed: Schema.string().default('处决失败！系统返回错误：{error}').description('执行强制终止失败时的提示'),
  }).description('通用返回消息'),
  setServer: Schema.object({
    runningBlocked: Schema.string().default('服务器开着呢，不能热插拔啦~').description('运行中禁止切换服务端时的提示'),
    invalidName: Schema.string().default('爬！服务器列表里只有\n{available}').description('服务端名称无效时的提示'),
    success: Schema.string().default('当前服务器已切换为 {name}\n{path}').description('切换服务端成功时的提示'),
  }).description('切换服务端命令返回消息'),
  startServer: Schema.object({
    alreadyRunning: Schema.string().default('别吵别吵，服务器已经在运行了，PID: {pid}').description('服务器已在运行时的提示'),
    starting: Schema.string().default('服务器正在启动中，请稍等~').description('服务器正在启动时的提示'),
    noServerSelected: Schema.string().default('未指定服务端！').description('未指定服务端时的提示'),
    startFailed: Schema.string().default('启动出错: {error}').description('启动失败时的提示'),
    startAccepted: Schema.string().default('正在启动{serverName}，PID: {pid}').description('启动成功接管进程时的提示'),
  }).description('开服命令返回消息'),
  stopServer: Schema.object({
    stopCommandSent: Schema.string().default('stop指令发送喽~').description('已发送 stop 指令时的提示'),
    forceKilling: Schema.string().default('stop无法正常关闭，强制处决中......').description('stop 超时后开始强制终止时的提示'),
    stopFailed: Schema.string().default('停止指令发送失败: {error}').description('发送 stop 指令失败时的提示'),
  }).description('关服命令返回消息'),
  sudo: Schema.object({
    emptyCommand: Schema.string().default('你sudo你🐎呢').description('未提供控制台命令时的提示'),
    noOutput: Schema.string().default('命令已发送，无输出').description('控制台命令无输出时的提示'),
    sendFailed: Schema.string().default('命令发送失败: {error}').description('控制台命令发送失败时的提示'),
  }).description('sudo 命令返回消息'),
  say: Schema.object({
    noPermission: Schema.string().default('你没有发送信息的权限！').description('无 say 权限时的提示'),
    emptyContent: Schema.string().default('你say你🐎呢').description('未提供 say 内容时的提示'),
    sendFailed: Schema.string().default('发送失败: {error}').description('say 命令失败时的提示'),
  }).description('say 命令返回消息'),
  list: Schema.object({
    noOutput: Schema.string().default('命令已发送，但无输出').description('list 命令无输出时的提示'),
    queryFailed: Schema.string().default('查询失败: {error}').description('list 命令失败时的提示'),
  }).description('list 命令返回消息'),
  killServer: Schema.object({
    killSuccess: Schema.string().default('处决成功！已清理进程~').description('强制终止成功时的提示'),
  }).description('强制终止命令返回消息'),
}).description('命令执行后的返回消息配置')

// 插件主配置 Schema
export const Config: Schema<Config> = Schema.object({
  runtime: Schema.union(['windows', 'linux']).default('windows').description('运行环境'),
  serverPaths: Schema.dict(String).role('table').description('服务端名称与目录（绝对路径）').required(),
  batName: Schema.string().description('启动脚本名称').required(),
  allowedGroups: Schema.array(String).default([]).description('允许控制的群组'),
  adminIds: Schema.array(String).description('允许控制的用户账号').required(),
  encoding: Schema.union(['utf-8', 'gbk']).default('utf-8').description('服务端日志编码'),
  injectMcChatToKoishi: Schema.boolean().default(false).description('将MC玩家聊天注入到Koishi消息处理链'),
  injectTargetGroup: Schema.string().default('').description('注入目标群组ID（留空则使用allowedGroups）'),
  llmPrefix: Schema.string().default('执行/').description('LLM触发前缀（匹配到后将其后内容发送到服务端控制台）'),
  llmBotIds: Schema.array(String).default([]).description('允许触发后台指令的云端机器人账号ID'),
  commands: CommandConfigSchema.required(),
  tipsTittle: Schema.object({}).description('消息配置可用的模板变量'),
  tipsMessage: Schema.object({}).description('{player} {message} {available} {name} {path} {serverName} {pid} {error}'),
  broadcasts: BroadcastConfigSchema.required(),
  responses: ResponseConfigSchema.required(),
}).description('注意：建议启动脚本保持前台运行，不要在脚本内自行脱离控制台。')

export const name = 'local-mcs-runner'

// 运行时状态提升到全局，用于在 Koishi 热重载插件时保留对子进程的控制句柄
type RuntimeStatus = 'stopped' | 'starting' | 'running' | 'stopping'

interface PluginRuntime {
  child: ChildProcess | null
  status: RuntimeStatus
  currentServerName: string
  expectedExit: boolean
  isCapturing: boolean
  captureBuffer: string[]
  cleanupListeners: (() => void) | null
}

const runtimeKey = Symbol.for('koishi-plugin-local-mcs-runner.runtime')

// 初始化全局共享运行时；仅在当前 Node 进程首次加载插件时创建一次
const createRuntime = (): PluginRuntime => ({
  child: null,
  status: 'stopped',
  currentServerName: '',
  expectedExit: false,
  isCapturing: false,
  captureBuffer: [],
  cleanupListeners: null,
})

// 从 globalThis 读取共享运行时，使新插件实例可以在热重载后复用旧进程句柄
const getRuntime = () => {
  const host = globalThis as typeof globalThis & { [runtimeKey]?: PluginRuntime }
  host[runtimeKey] ??= createRuntime()
  return host[runtimeKey]
}

// 延时函数
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export function apply(ctx: Context, config: Config) {
  // runtime 不跟随单次 apply 生命周期销毁，在插件重载后继续管理原有服务端进程
  const runtime = getRuntime()
  const logger = ctx.logger('MC-Server')
  const decoder = new TextDecoder(config.encoding)  

  // 首次加载插件时默认选择第一项服务端；重载后保留用户之前切换的目标服务端
  if (!runtime.currentServerName) {
    runtime.currentServerName = Object.keys(config.serverPaths)[0] || ''
  }

  const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  // 替换可配置文案中的占位符，供广播内容和命令返回消息复用
  const formatTemplate = (template: string, params: Record<string, string | number>) => {
    return template.replace(/\{(\w+)\}/g, (_, key: string) => {
      return params[key] === undefined ? `{${key}}` : String(params[key])
    })
  }

  // 判断当前托管中的子进程是否仍然可用，避免仅凭对象存在就误判为运行中
  const isProcessAlive = (child: ChildProcess | null = runtime.child) => {
    return !!child && !!child.pid && child.exitCode === null && !child.killed
  }

  // 清理一次命令输出捕获的临时状态，防止重载或退出后残留旧缓冲区
  const clearCaptureState = () => {
    runtime.isCapturing = false
    runtime.captureBuffer = []
  }

  // 在服务端进程彻底退出后统一重置托管状态
  const resetProcessState = () => {
    runtime.child = null
    runtime.status = 'stopped'
    runtime.expectedExit = false
    clearCaptureState()
  }

  // 移除旧实例绑定的监听器，避免同一子进程被重复监听
  const detachProcessListeners = () => {
    runtime.cleanupListeners?.()
    runtime.cleanupListeners = null
  }

  // 关闭服务器优先等待进程自行退出，超时后强杀
  const waitForClose = (child: ChildProcess, timeout: number) => {
    return new Promise<boolean>((resolve) => {
      let settled = false
      const finish = (closed: boolean) => {
        if (settled) return
        settled = true
        child.off('close', onClose)
        clearTimeout(timer)
        resolve(closed)
      }
      const onClose = () => finish(true)
      const timer = setTimeout(() => finish(false), timeout)
      child.once('close', onClose)
    })
  }

  // 将 stdout / stderr / close / error 监听统一绑定到当前托管进程上
  const attachProcessListeners = (child: ChildProcess) => {
    detachProcessListeners()

    const handleStdout = (data: Buffer) => {
      const chunk = decoder.decode(data, { stream: true }).trim()
      const lines = chunk.split('\n')

      for (const line of lines) {
        const rawLog = line.trim()
        if (!rawLog) continue

        logger.info(rawLog)

        if (!runtime.isCapturing) {
          const chat = parseChat(rawLog)
          if (chat) {
            const msg = formatTemplate(config.broadcasts.mcChat, {
              player: chat.player,
              message: chat.message,
            })
            void broadcastToGroup(msg)
            void injectMcChatToKoishi(chat.player, chat.message)
          }
        } else {
          const cleanContent = cleanLog(rawLog)
          if (cleanContent) {
            runtime.captureBuffer.push(cleanContent)
          }
        }
      }
    }

    const handleStderr = (data: Buffer) => {
      logger.warn(data.toString().trim())
    }

    // 统一清理共享状态并发送对应广播
    const handleClose = (code: number | null) => {
      logger.info(`服务端进程已退出，代码: ${code}`)
      const wasExpected = runtime.expectedExit
      detachProcessListeners()
      resetProcessState()
      void broadcastToGroup(wasExpected ? config.broadcasts.stopByUser : config.broadcasts.stopUnexpectedly)
    }

    const handleError = (error: Error) => {
      logger.error(`服务端进程异常: ${error.message}`)
    }

    child.stdout?.on('data', handleStdout)
    child.stderr?.on('data', handleStderr)
    child.on('close', handleClose)
    child.on('error', handleError)

    // 保存当前实例的解绑函数，供下次热重载或插件卸载时使用
    runtime.cleanupListeners = () => {
      child.stdout?.off('data', handleStdout)
      child.stderr?.off('data', handleStderr)
      child.off('close', handleClose)
      child.off('error', handleError)
    }
  }

  // 如果共享状态里残留的是失效句柄，则在新实例接管前清空
  if (runtime.child && !isProcessAlive(runtime.child)) {
    detachProcessListeners()
    resetProcessState()
  }

  // 热重载后重新绑定现有子进程监听器，恢复插件对旧服务端进程的控制能力
  if (runtime.child && isProcessAlive(runtime.child)) {
    attachProcessListeners(runtime.child)
    runtime.status = runtime.status === 'stopping' ? 'stopping' : 'running'
    logger.info(`检测到已存在的服务端进程，已重新绑定监听器 (PID: ${runtime.child.pid})`)
  }

  // 插件卸载/重载时只解绑监听器，不主动终止服务端进程
  ctx.on('dispose', () => {
    detachProcessListeners()
  })

  // 监听群消息，提取云端LLM触发的控制台指令
  ctx.on('message', async (session: any) => {
    const mcProcess = runtime.child
    if (!isProcessAlive(mcProcess) || !config.llmPrefix) return

    const targetGroupId = session.guildId || session.channelId
    const userId = session.userId
    const content = session?.content

    logger.info(`[LLM-HOOK] recv user=${userId} guild=${session.guildId} channel=${session.channelId} content=${content}`)

    if (config.allowedGroups.length > 0 && targetGroupId && !config.allowedGroups.includes(targetGroupId)) {
      logger.info(`[LLM-HOOK] blocked by allowedGroups, target=${targetGroupId}`)
      return
    }

    const isAllowedUser = config.llmBotIds.includes(userId) || config.adminIds.includes(userId)
    if (!isAllowedUser) {
      logger.info(`[LLM-HOOK] blocked by identity, user=${userId}`)
      return
    }

    if (!content || typeof content !== 'string') {
      logger.info('[LLM-HOOK] blocked by empty content')
      return
    }

    const escapedPrefix = escapeRegExp(config.llmPrefix)
    const regex = new RegExp(`${escapedPrefix}\\s*([^\\n]+)`)
    const match = content.match(regex)
    if (!match || !match[1]) {
      logger.info(`[LLM-HOOK] prefix not matched, prefix=${config.llmPrefix}`)
      return
    }

    const command = match[1].replace(/^\/+/, '').trim()
    if (!command) {
      logger.info('[LLM-HOOK] matched but command empty')
      return
    }

    logger.info(`收到来自 ${userId} 的控制台指令: ${command}`)
    try {
      mcProcess.stdin?.write(command + '\n')
      logger.info(`[LLM-HOOK] command sent: ${command}`)
    } catch (e) {
      logger.error(`指令执行失败: ${e.message}`)
    }
  })

  // 杀死服务器进程
  const killProcessByRuntime = (pid: number, force = true, callback?: (error?: Error) => void) => {
    const cmd = config.runtime === 'linux'
      ? `kill ${force ? '-KILL' : '-TERM'} ${pid}`
      : `taskkill /pid ${pid} /T /F`

    exec(cmd, (error) => {
      if (callback) callback(error || undefined)
    })
  }

  // 按运行环境启动服务器进程
  const startProcessByRuntime = (targetPath: string) => {
    if (config.runtime === 'linux') {
      const linuxScript = config.batName.startsWith('./') ? config.batName : `./${config.batName}`
      return spawn(linuxScript, [], {
        cwd: targetPath,
        shell: true,
        stdio: 'pipe'
      })
    }

    return spawn(config.batName, [], {
      cwd: targetPath,
      shell: true,
      stdio: 'pipe'
    })
  }

  // 日志清洗工具
  const cleanLog = (log: string): string | null => {
    // 匹配标准控制台输出格式
    const regex = /^\[\d{2}:\d{2}:\d{2}\] \[.*?\]:?\s*(.*)$/
    const match = log.match(regex)
    if (match && match[1]) {
      return match[1].trim()
    }
    return log
  }

  // 聊天信息检测
  const parseChat = (log: string) => {
    const chatRegex = /]:\s*<([^>]+)>\s*(.*)$/
    const match = log.match(chatRegex)
    if (match) {
      return { player: match[1], message: match[2] }
    }
    return null
  }

  // 聊天信息广播
  const broadcastToGroup = async (message: string) => {
    for (const bot of ctx.bots) {
      for (const groupId of config.allowedGroups) {
        try {
          await bot.sendMessage(groupId, message)
        } catch (e) {
          logger.warn(`转发消息到群组 ${groupId} 失败: ${e.message}`)
        }
      }
    }
  }

  // 将MC聊天注入到Koishi消息处理链
  const injectMcChatToKoishi = async (player: string, message: string) => {
    if (!config.injectMcChatToKoishi) return
    const content = message?.trim()
    if (!content) return

    const targetGroups = config.injectTargetGroup
      ? [config.injectTargetGroup]
      : config.allowedGroups

    if (!targetGroups.length) {
      logger.warn('MC聊天注入已开启，但没有可用的目标群组（injectTargetGroup / allowedGroups）')
      return
    }

    for (const bot of ctx.bots) {
      for (const groupId of targetGroups) {
        try {
          const safePlayer = player.replace(/[^\w\u4e00-\u9fa5-]/g, '_')
          const userId = `mc_${safePlayer}`
          const now = Date.now()
          const session = bot.session() as any

          session.type = 'message'
          session.subtype = 'group'
          session.platform = bot.platform
          session.selfId = bot.selfId
          session.userId = userId
          session.channelId = groupId
          session.guildId = groupId
          session.content = content
          session.messageId = `mc-${now}-${Math.random().toString(36).slice(2, 8)}`
          session.timestamp = now
          session.isDirect = false

          session.author = {
            id: userId,
            name: `MC-${player}`,
            username: `MC-${player}`,
            nickname: player,
          }

          session.event ??= {}
          session.event.user = {
            id: userId,
            name: `MC-${player}`,
          }
          session.event.channel = {
            id: groupId,
            type: 0,
          }
          session.event.message = {
            id: session.messageId,
            content,
            user: session.event.user,
            channel: session.event.channel,
            timestamp: now,
          }

          await session.execute(content)
        } catch (e) {
          logger.warn(`注入MC聊天到Koishi失败（${groupId}）: ${e.message}`)
        }
      }
    }
  }

  // 权限检查
  const checkPermission = (session: any) => {
    const isGroupAllowed = config.allowedGroups.includes(session.guildId)
    const isUserAllowed = config.adminIds.includes(session.userId)
    return isGroupAllowed || isUserAllowed
  }

  // 指令：指定服务端
  ctx.command(`${config.commands.setServer} <name:string>`, '指定当前操作的服务端')
    .action(async ({ session }, name) => {
      // 权限检查
      if (!checkPermission(session)) return config.responses.common.noControlPermission

      // 状态检查
      if (isProcessAlive()) return config.responses.setServer.runningBlocked

      // 检查服务端名称
      if (!Object.keys(config.serverPaths).includes(name) || !name) {
        const available = Object.keys(config.serverPaths).join(' | ')
        return formatTemplate(config.responses.setServer.invalidName, { available })
      }

      const targetPath = config.serverPaths[name]
      try {
        if (!targetPath || !fs.existsSync(targetPath) || !fs.statSync(targetPath).isDirectory()) {
          return formatTemplate(config.responses.common.pathUnavailable, { path: targetPath })
        }
      } catch (e) {
        return formatTemplate(config.responses.common.pathUnavailable, { path: targetPath })
      }

      runtime.currentServerName = name
      return formatTemplate(config.responses.setServer.success, {
        name,
        path: targetPath,
      })
    })

  // 指令：开启服务器
  ctx.command(config.commands.startServer, '启动MC服务器')
    .action(async ({ session }) => {
      // 权限检查
      if (!checkPermission(session)) return config.responses.common.noControlPermission

      // 状态检查
      if (isProcessAlive()) {
        return formatTemplate(config.responses.startServer.alreadyRunning, { pid: runtime.child.pid })
      }

      if (runtime.status === 'starting') {
        return config.responses.startServer.starting
      }

      // 检查服务端名称
      if (!runtime.currentServerName) {
        return config.responses.startServer.noServerSelected
      }

      const targetPath = config.serverPaths[runtime.currentServerName]
      if (!targetPath || !fs.existsSync(targetPath) || !fs.statSync(targetPath).isDirectory()) {
        return formatTemplate(config.responses.common.pathUnavailable, { path: targetPath })
      }

      try {
        // 启动阶段先进入 starting，避免用户连续触发重复开服
        runtime.status = 'starting'
        runtime.expectedExit = false
        clearCaptureState()

        const child = startProcessByRuntime(targetPath)

        // spawn 的失败通常经由 error / close / exit 上报，因此这里显式等待短时间确认启动结果
        const startupResult = await new Promise<{ ok: boolean, error?: Error }>((resolve) => {
          let settled = false
          const finish = (result: { ok: boolean, error?: Error }) => {
            if (settled) return
            settled = true
            child.off('error', onError)
            child.off('close', onClose)
            child.off('exit', onExit)
            clearTimeout(timer)
            resolve(result)
          }
          const onError = (error: Error) => finish({ ok: false, error })
          const onClose = () => finish({ ok: false, error: new Error('启动脚本已退出') })
          const onExit = () => finish({ ok: false, error: new Error('启动脚本已退出') })
          const timer = setTimeout(() => finish({ ok: true }), 1500)

          child.once('error', onError)
          child.once('close', onClose)
          child.once('exit', onExit)
        })

        if (!startupResult.ok) {
          runtime.status = 'stopped'
          runtime.expectedExit = false
          return formatTemplate(config.responses.startServer.startFailed, { error: startupResult.error.message })
        }

        runtime.child = child
        runtime.status = 'running'
        attachProcessListeners(child)
        logger.info(`服务器已启动并接管进程 (PID: ${child.pid})`)
        return formatTemplate(config.responses.startServer.startAccepted, {
          serverName: runtime.currentServerName,
          pid: child.pid,
        })

      } catch (e) {
        logger.error(e)
        resetProcessState()
        return formatTemplate(config.responses.startServer.startFailed, { error: e.message })
      }
    })

  // 指令：关闭服务器
  ctx.command(config.commands.stopServer, '关闭MC服务器')
    .action(async ({ session }) => {
      // 权限校验
      if (!checkPermission(session)) return config.responses.common.noControlPermission

      // 状态检查
      const mcProcess = runtime.child
      if (!isProcessAlive(mcProcess)) {
        return config.responses.common.serverNotRunning
      }

      const currentPid = mcProcess.pid

      try {
        // 标记为预期退出，避免 close 时被误判成崩服广播
        runtime.expectedExit = true
        runtime.status = 'stopping'
        mcProcess.stdin?.write('stop\n')
        session.send(config.responses.stopServer.stopCommandSent)

        const closed = await waitForClose(mcProcess, 10000)

        if (!closed && isProcessAlive(mcProcess)) {
          session.send(config.responses.stopServer.forceKilling)
          killProcessByRuntime(currentPid, true, (error) => {
            if (error) {
              logger.error(`杀死服务端进程失败: ${error.message}`)
              session.send(formatTemplate(config.responses.common.killFailed, { error: error.message }))
            } else {
              logger.info(`已执行 ${config.runtime} 进程终止命令，等待进程清理……`)
            }
          })
        }

        return
      } catch (e) {
        logger.error(e)
        runtime.expectedExit = false
        runtime.status = isProcessAlive(mcProcess) ? 'running' : 'stopped'
        return formatTemplate(config.responses.stopServer.stopFailed, { error: e.message })
      }
    })

  // 指令：向服务器发送命令
  ctx.command(`${config.commands.sudo} <command:text>`, '向服务器发送控制台命令')
    .action(async ({ session }, command) => {
      // 权限校验
      if (!checkPermission(session)) return config.responses.common.noControlPermission

      // 状态检查
      const mcProcess = runtime.child
      if (!isProcessAlive(mcProcess)) {
        return config.responses.common.serverNotRunning
      }

      // 命令参数检查
      if (!command) {
        return config.responses.sudo.emptyCommand
      }

      try {
        runtime.isCapturing = true
        runtime.captureBuffer = []

        mcProcess.stdin?.write(command + '\n')

        await sleep(1000)

        runtime.isCapturing = false

        if (runtime.captureBuffer.length === 0) {
          return config.responses.sudo.noOutput
        }

        const output = runtime.captureBuffer.join('\n')
        runtime.captureBuffer = []
        return output.length > 300 ? output.substring(0, 300) + '\n...（消息过长，已截断）' : output

      } catch (e) {
        runtime.isCapturing = false
        logger.error(e)
        return formatTemplate(config.responses.sudo.sendFailed, { error: e.message })
      }
    })

  // 指令：向服务器发送信息
  ctx.command(`${config.commands.say} <content:text>`, '向服务器发送信息')
    .action(async ({ session }, content) => {
      // 权限校验
      if (!checkPermission(session)) return config.responses.say.noPermission

      // 状态检查
      const mcProcess = runtime.child
      if (!isProcessAlive(mcProcess)) return config.responses.common.serverNotRunning

      // 内容检查
      if (!content) return config.responses.say.emptyContent

      try {
        const senderName = session.username || session.userId
        mcProcess.stdin?.write(`say ${senderName}：${content}\n`)
        return null
      } catch (e) {
        logger.error(e)
        return formatTemplate(config.responses.say.sendFailed, { error: e.message })
      }
    })

  // 指令：查询在线玩家
  ctx.command(config.commands.list, '查询服务器在线玩家')
    .action(async ({ session }) => {
      // 权限校验
      if (!checkPermission(session)) return config.responses.common.noControlPermission

      // 状态检查
      const mcProcess = runtime.child
      if (!isProcessAlive(mcProcess)) return config.responses.common.serverNotRunning

      try {
        runtime.isCapturing = true
        runtime.captureBuffer = []

        mcProcess.stdin?.write('list\n')

        await sleep(2000)

        runtime.isCapturing = false

        if (runtime.captureBuffer.length === 0) {
          return config.responses.list.noOutput
        }

        const output = runtime.captureBuffer.join('\n')
        runtime.captureBuffer = []
        return output.length > 500 ? output.substring(0, 500) + '\n...（消息过长）' : output

      } catch (e) {
        runtime.isCapturing = false
        logger.error(e)
        return formatTemplate(config.responses.list.queryFailed, { error: e.message })
      }
    })

  // 指令：强制杀死服务器进程
  ctx.command(config.commands.killServer, '强制杀死服务器进程')
    .action(async ({ session }) => {
      // 权限校验
      if (!checkPermission(session)) return config.responses.common.noControlPermission

      // 状态检查
      const mcProcess = runtime.child
      if (!isProcessAlive(mcProcess)) {
        return config.responses.common.serverNotRunning
      }

      const currentPid = mcProcess.pid

      try {
        // 强杀同样属于预期退出，最终状态仍交由 close 回调统一收口。
        runtime.expectedExit = true
        runtime.status = 'stopping'
        killProcessByRuntime(currentPid, true, (error) => {
          if (error) {
            logger.error(`杀死服务端进程失败: ${error.message}`)
            session.send(formatTemplate(config.responses.common.killFailed, { error: error.message }))
          } else {
            logger.info(`已执行 ${config.runtime} 进程终止命令，等待进程树清理……`)
            session.send(config.responses.killServer.killSuccess)
          }
        })
        return
      } catch (e) {
        logger.error(e)
        return formatTemplate(config.responses.common.killFailed, { error: e.message })
      }
    })
}
