; Inno Setup Script for Crossed Viper (Windows)
; Download Inno Setup 6 from: https://jrsoftware.org/isdl.php
;
; Build (after PyInstaller, from project root):
;   "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" crossed-viper\desktopclient\crossed_viper_installer.iss

[Setup]
AppName=Crossed Viper
AppVersion=1.0.0
AppPublisher=Viper Suite
AppPublisherURL=https://github.com/
DefaultDirName={autopf}\Crossed Viper
DefaultGroupName=Crossed Viper
AllowNoIcons=yes
OutputDir=dist\installer
OutputBaseFilename=CrossedViper_Setup_1.0.0
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\CrossedViper.exe
PrivilegesRequired=lowest
ArchitecturesInstallIn64BitMode=x64

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
Name: "startupicon"; Description: "Launch Crossed Viper on Windows startup"; GroupDescription: "Startup"; Flags: unchecked

[Files]
Source: "dist\CrossedViper\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Crossed Viper";                         Filename: "{app}\CrossedViper.exe"
Name: "{group}\{cm:UninstallProgram,Crossed Viper}";   Filename: "{uninstallexe}"
Name: "{commondesktop}\Crossed Viper";                 Filename: "{app}\CrossedViper.exe"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; \
    ValueType: string; ValueName: "Crossed Viper"; \
    ValueData: """{app}\CrossedViper.exe"""; \
    Flags: uninsdeletevalue; Tasks: startupicon

[Run]
Filename: "{app}\CrossedViper.exe"; Description: "{cm:LaunchProgram,Crossed Viper}"; \
    Flags: nowait postinstall skipifsilent
