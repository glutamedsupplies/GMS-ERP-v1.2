Set WshShell = CreateObject("WScript.Shell")
Set Fso = CreateObject("Scripting.FileSystemObject")
NodeExe = WshShell.ExpandEnvironmentStrings("%ProgramFiles%") & "\nodejs\node.exe"
If Not Fso.FileExists(NodeExe) Then
    NodeExe = "node"
End If
LogPath = "C:\Users\pc\AttendanceApp\launcher-start.log"
WshShell.Run "cmd /c cd /d ""C:\Users\pc\AttendanceApp"" && """ & NodeExe & """ server.js >> """ & LogPath & """ 2>&1", 0, False
