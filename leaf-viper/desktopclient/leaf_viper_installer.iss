; Inno Setup Script for Leaf Viper (Windows)
; Download Inno Setup 6 from: https://jrsoftware.org/isdl.php
;
; Build (after PyInstaller, from project root):
;   "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" leaf-viper\desktopclient\leaf_viper_installer.iss

[Setup]
AppName=Leaf Viper
AppVersion=1.0.0
AppPublisher=Viper Suite
AppPublisherURL=https://github.com/
DefaultDirName={autopf}\Leaf Viper
DefaultGroupName=Leaf Viper
AllowNoIcons=yes
OutputDir=dist\installer
OutputBaseFilename=LeafViper_Setup_1.0.0
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\LeafViper.exe
PrivilegesRequired=lowest
ArchitecturesInstallIn64BitMode=x64

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
Name: "startupicon"; Description: "Launch Leaf Viper on Windows startup"; GroupDescription: "Startup"; Flags: unchecked

[Files]
Source: "dist\LeafViper\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Leaf Viper";                     Filename: "{app}\LeafViper.exe"
Name: "{group}\{cm:UninstallProgram,Leaf Viper}"; Filename: "{uninstallexe}"
Name: "{commondesktop}\Leaf Viper";             Filename: "{app}\LeafViper.exe"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; \
    ValueType: string; ValueName: "Leaf Viper"; \
    ValueData: """{app}\LeafViper.exe"""; \
    Flags: uninsdeletevalue; Tasks: startupicon

[Run]
Filename: "{app}\LeafViper.exe"; Description: "{cm:LaunchProgram,Leaf Viper}"; \
    Flags: nowait postinstall skipifsilent
