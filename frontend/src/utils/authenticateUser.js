// src/utils/authenticateUser.js

export const authenticateUser = async (setUser, setIsAuthenticated, setWindowsUsername, setFullName, setConnectionStatus) => 
  {
  try {
    const response = await fetch('http://localhost:5000/api/authenticate', {
      method: 'POST',
      credentials: 'include',
    });

    if (response.ok) {
      const data = await response.json();
      // console.log('Authentication response:', data);

      // 사용자가 있는지 확인 후 상태 업데이트
      setUser(data.user || null);
      setIsAuthenticated(data.authenticated || false);

      // 인증 성공 후 Windows 사용자 정보 가져오기
      await fetchWindowsUserInfo(setWindowsUsername, setFullName, setConnectionStatus);
    } else {
      console.error('Authentication failed:', await response.text());
      setIsAuthenticated(false);
    }
  } catch (error) {
    console.error('Authentication error:', error);
    setIsAuthenticated(false);
  }
};

export const fetchWindowsUserInfo = async (setWindowsUsername, setFullName, setConnectionStatus) => 
  {
  try {
    const response = await fetch('http://localhost:5000/api/get_windows_user', {
      credentials: 'include',
    });

    if (response.ok) {
      const data = await response.json();
      // console.log('Windows user info:', data);

      // 상태 업데이트가 함수로 제공된 경우에만 업데이트 진행
      if (setWindowsUsername) setWindowsUsername(data.user || '');
      if (setFullName) setFullName(data.full_name || '');
      if (setConnectionStatus) setConnectionStatus(data.connection_status || 'Connected');
    } else {
      console.error('Failed to fetch Windows user info:', await response.text());
      if (setConnectionStatus) setConnectionStatus('연결 실패');
    }
  } catch (error) {
    console.error('Error fetching Windows user info:', error);
    if (setConnectionStatus) setConnectionStatus('연결 실패');
  }
};

export const fetchDatabases = async (setDatabases, setSelectedDatabase) => {
  try {
    const response = await fetch('http://localhost:5000/api/get_list_database', {
      credentials: 'include',
    });

    if (response.ok) {
      const data = await response.json();
      setDatabases(data.databases || []);
      if (data.databases.length > 0) {
        setSelectedDatabase(data.databases[0]);
      }
    } else {
      console.error('데이터베이스 가져오기 실패');
    }
  } catch (error) {
    console.error('오류:', error);
  }
};
