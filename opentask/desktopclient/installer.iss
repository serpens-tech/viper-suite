; Inno Setup Script for OpenTask (Windows)
; Download Inno Setup 6 from: https://jrsoftware.org/isdl.php
;
; Build (after PyInstaller, from project root):
;   "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" opentask\desktopclient\installer.iss

[Setup]
AppName=OpenTask
AppVersion=1.0.0
AppPublisher=OpenTask
AppPublisherURL=https://github.com/
DefaultDirName={autopf}\OpenTask
DefaultGroupName=OpenTask
AllowNoIcons=yes
OutputDir=dist\installer
OutputBaseFilename=OpenTask_Setup_1.0.0
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\OpenTask.exe
PrivilegesRequired=lowest
ArchitecturesInstallIn64BitMode=x64

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
Name: "startupicon"; Description: "Launch OpenTask on Windows startup"; GroupDescription: "Startup"; Flags: unchecked

[Files]
Source: "dist\OpenTask\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\OpenTask";                         Filename: "{app}\OpenTask.exe"
Name: "{group}\{cm:UninstallProgram,OpenTask}";   Filename: "{uninstallexe}"
Name: "{commondesktop}\OpenTask";                 Filename: "{app}\OpenTask.exe"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; \
    ValueType: string; ValueName: "OpenTask"; \
    ValueData: """{app}\OpenTask.exe"""; \
    Flags: uninsdeletevalue; Tasks: startupicon

[Run]
Filename: "{app}\OpenTask.exe"; Description: "{cm:LaunchProgram,OpenTask}"; \
    Flags: nowait postinstall skipifsilent
