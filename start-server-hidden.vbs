Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd /c cd /d ""C:\Users\pc\AttendanceApp"" && ""C:\Users\pc\AttendanceApp\node_modules\.bin\electron.cmd"" server.js", 0, False
