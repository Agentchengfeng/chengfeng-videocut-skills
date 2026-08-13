#!/bin/sh
set -eu

if [ "${1:-}" = "--version" ]; then
  echo 'chengfeng-videocut 0.5.4'
  exit 0
fi

if [ "${1:-}" = "doctor" ] && [ "${2:-}" = "--local-development" ]; then
  if [ ! -f "${CHENGFENG_VIDEOCUT_HOME:?}/development-authorized" ]; then
    printf '%s\n' '{"ok":false,"data":{"healthy":false,"developmentMode":false,"releaseReady":false,"readinessMode":"unready"}}'
    exit 3
  fi
  printf '%s\n' '{"ok":true,"data":{"healthy":true,"developmentMode":true,"releaseReady":false,"readinessMode":"local-development","capabilities":{"runtimeApiVersion":1,"serviceApiVersion":1,"serviceOperations":["install","start","stop","restart","status","logs","ensure"],"managedStudioService":true,"serviceParentProcessIndependent":true,"serviceCrashRestart":true,"durableJobsApiVersion":1,"durableJobKinds":["export"],"editListSchemaVersion":1,"editListOperations":["move","trim","split","delete","restore","delete-range","restore-snapshot"],"managedArollProjection":true,"expectedEditListRevision":true,"projectIngestVersion":1,"transcriptPlaybackPagingVersion":1,"cloudTranscriptionProvider":"volcengine","cloudTranscriptionTaskLocalOnly":true}}}'
  exit 0
fi

if [ "${1:-}" = "doctor" ] && [ "${2:-}" = "--json" ]; then
  printf '%s\n' '{"ok":true,"data":{"healthy":true,"developmentMode":true,"releaseReady":false,"readinessMode":"local-development","capabilities":{"runtimeApiVersion":1,"serviceApiVersion":1,"serviceOperations":["install","start","stop","restart","status","logs","ensure"],"managedStudioService":true,"serviceParentProcessIndependent":true,"serviceCrashRestart":true,"durableJobsApiVersion":1,"durableJobKinds":["export"],"editListSchemaVersion":1,"editListOperations":["move","trim","split","delete","restore","delete-range","restore-snapshot"],"managedArollProjection":true,"expectedEditListRevision":true,"projectIngestVersion":1,"transcriptPlaybackPagingVersion":1,"cloudTranscriptionProvider":"volcengine","cloudTranscriptionTaskLocalOnly":true}}}'
  exit 0
fi

exit 3
