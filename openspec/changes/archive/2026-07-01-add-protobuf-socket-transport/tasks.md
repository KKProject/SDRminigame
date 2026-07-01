## 1. Schema 与构建

- [x] 1.1 新增 socket 实时消息 `.proto` 文件，覆盖 envelope、snapshot、event、delta、intent、ack
- [x] 1.2 选择小程序可用的 protobuf 编解码方案并记录包体影响
- [x] 1.3 增加 schema 生成或加载脚本，避免手写字段编号分散

## 2. 服务端二进制传输

- [x] 2.1 在 socket 层识别 JSON frame 与 protobuf binary frame
- [x] 2.2 增加服务端 protobuf 编码发送路径
- [x] 2.3 增加服务端 protobuf 解码客户端请求路径
- [x] 2.4 增加配置开关支持生产回滚 JSON

## 3. 客户端二进制传输

- [x] 3.1 在客户端 socket transport 中增加 protobuf 能力声明
- [x] 3.2 支持接收和解码 protobuf binary frame
- [x] 3.3 支持将客户端请求编码为 protobuf
- [x] 3.4 解码失败时触发重连或快照恢复

## 4. 测试与灰度

- [x] 4.1 增加 JSON/protobuf 同语义 fixtures 测试
- [x] 4.2 增加 protobuf 解码失败不应用状态的测试
- [x] 4.3 增加配置关闭 protobuf 后 JSON 路径仍可用的测试
- [x] 4.4 运行 `node scripts/run-online-checks.mjs`
- [x] 4.5 运行 `node scripts/run-backend-checks.mjs`
