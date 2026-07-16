Pod::Spec.new do |s|
  s.name = 'GafusYooKassaPayments'
  s.version = '0.1.0'
  s.summary = 'YooKassa native SBP bridge for Gafus'
  s.description = 'Expo module that limits YooKassa Mobile SDK payments to SBP.'
  s.license = { :type => 'MIT' }
  s.author = { 'Gafus' => 'dev@gafus.ru' }
  s.homepage = 'https://gafus.ru'
  s.platforms = { :ios => '15.1' }
  s.swift_version = '5.9'
  s.source = { :git => 'https://github.com/asmtv1/gafus1.git' }
  s.static_framework = true
  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
  s.dependency 'ExpoModulesCore'
  # 9.0.1 is the newest release compatible with AppMetricaAnalytics 5.x,
  # which is pinned by @appmetrica/react-native-analytics 3.6.0 in this app.
  s.dependency 'YooKassaPayments', '9.0.1'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
