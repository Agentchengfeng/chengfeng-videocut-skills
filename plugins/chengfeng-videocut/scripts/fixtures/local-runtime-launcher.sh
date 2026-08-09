#!/bin/sh
set -eu

if [ "${1:-}" = "--version" ]; then
  echo 'chengfeng-videocut 0.5.3'
  exit 0
fi

if [ "${1:-}" = "doctor" ] && [ "${2:-}" = "--local-development" ]; then
  if [ ! -f "${CHENGFENG_VIDEOCUT_HOME:?}/development-authorized" ]; then
    printf '%s\n' '{"ok":false,"data":{"healthy":false,"developmentMode":false,"releaseReady":false,"readinessMode":"unready"}}'
    exit 3
  fi
  printf '%s\n' '{"ok":true,"data":{"healthy":true,"developmentMode":true,"releaseReady":false,"readinessMode":"local-development","capabilities":{"runtimeApiVersion":1,"editListSchemaVersion":1,"editListOperations":["move","trim","split","delete"],"managedArollProjection":true,"expectedEditListRevision":true,"durableJobsApiVersion":1,"durableJobKinds":["export"],"serviceApiVersion":1,"serviceOperations":["install","start","stop","restart","status","logs","ensure"],"managedStudioService":true,"serviceParentProcessIndependent":true,"serviceCrashRestart":true}}}'
  exit 0
fi

if [ "${1:-}" = "doctor" ] && [ "${2:-}" = "--json" ]; then
  printf '%s\n' '{"ok":true,"data":{"healthy":true,"developmentMode":true,"releaseReady":false,"readinessMode":"local-development","capabilities":{"runtimeApiVersion":1,"editListSchemaVersion":1,"editListOperations":["move","trim","split","delete"],"managedArollProjection":true,"expectedEditListRevision":true,"durableJobsApiVersion":1,"durableJobKinds":["export"],"serviceApiVersion":1,"serviceOperations":["install","start","stop","restart","status","logs","ensure"],"managedStudioService":true,"serviceParentProcessIndependent":true,"serviceCrashRestart":true}}}'
  exit 0
fi

exit 3
