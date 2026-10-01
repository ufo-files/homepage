from pathlib import Path
import os, plistlib, shutil, subprocess
home=Path.home();repo=Path(__file__).resolve().parents[1];base=home/'Library/Application Support/ufo-files/live-inventory'
base.mkdir(parents=True,exist_ok=True)
for source in ['scripts/live_source_inventory.py','scripts/build_source_inventory.py','source-inventory.json']:
 shutil.copy2(repo/source,base/Path(source).name)
label='com.ufo-files.live-inventory'
args=[str(home/'Library/Application Support/ufo-files/agents/.venv/bin/python'),str(base/'live_source_inventory.py'),'/Volumes/UFO Files Archive 1','--seed',str(base/'source-inventory.json'),'--state-dir',str(base/'state')]
plist={'Label':label,'ProgramArguments':args,'RunAtLoad':True,'KeepAlive':True,'ThrottleInterval':60,
'WorkingDirectory':str(base),'EnvironmentVariables':{'HOME':str(home),'PATH':'/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin','PYTHONUNBUFFERED':'1'},
'StandardOutPath':str(home/'Library/Logs/ufo-files/live-inventory.log'),'StandardErrorPath':str(home/'Library/Logs/ufo-files/live-inventory.log')}
path=home/'Library/LaunchAgents'/f'{label}.plist';path.write_bytes(plistlib.dumps(plist))
service=f'gui/{os.getuid()}/{label}'
loaded=subprocess.run(['launchctl','print',service],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode == 0
if loaded:
 subprocess.run(['launchctl','kickstart','-k',service],check=True)
else:
 subprocess.run(['launchctl','bootstrap',f'gui/{os.getuid()}',str(path)],check=True)
print('Installed and started',label)
