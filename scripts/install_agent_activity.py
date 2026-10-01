"""Install the incremental activity feed publisher on the archive Mac."""
from pathlib import Path
import os
import plistlib
import shutil
import subprocess

home = Path.home()
repo = Path(__file__).resolve().parents[1]
base = home/'Library/Application Support/ufo-files/agent-activity'
base.mkdir(parents=True, exist_ok=True)
shutil.copy2(repo/'scripts/agent_activity.py', base/'agent_activity.py')
label = 'com.ufo-files.agent-activity'
args = ['/opt/homebrew/bin/python3.13', str(base/'agent_activity.py'),
        '--state', str(base/'activity.sqlite'), '--output', str(base/'agent-activity.json'), '--publish', '--watch']
plist = {'Label':label, 'ProgramArguments':args, 'RunAtLoad':True, 'KeepAlive':True, 'ThrottleInterval':60,
         'WorkingDirectory':str(base),
         'EnvironmentVariables':{'HOME':str(home),'PATH':'/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin','PYTHONUNBUFFERED':'1'},
         'StandardOutPath':str(home/'Library/Logs/ufo-files/agent-activity.log'),
         'StandardErrorPath':str(home/'Library/Logs/ufo-files/agent-activity.log')}
path = home/'Library/LaunchAgents'/f'{label}.plist'
path.write_bytes(plistlib.dumps(plist))
service = f'gui/{os.getuid()}/{label}'
loaded = subprocess.run(['launchctl','print',service],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode == 0
subprocess.run(['launchctl','kickstart','-k',service] if loaded else ['launchctl','bootstrap',f'gui/{os.getuid()}',str(path)],check=True)
print('Installed and started',label)
