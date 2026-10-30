' Launch the Spandan frontend (Vite dev server) with no visible console.
' Dependencies are expected to be installed already; run start-spandan.cmd once to bootstrap them.
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
repo = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = repo
logDir = fso.BuildPath(repo, "logs")
If Not fso.FolderExists(logDir) Then fso.CreateFolder(logDir)
' Window style 0 = hidden, so no command prompt appears. Output goes to logs\frontend.log.
sh.Run "cmd /c npm run dev --workspace=frontend > logs\frontend.log 2>&1", 0, False
