'use client'

import React, { useState, useEffect, useMemo } from 'react';
import { useTable, useFilters, useSortBy } from 'react-table';
import { FaSort, FaSortUp, FaSortDown } from 'react-icons/fa';
import { fetchViewerData } from '../api/viewer.js';
import styles from '../../style/viewer.module.css'

// 기본 필터 UI 컴포넌트
function DefaultColumnFilter({
  column: { filterValue, setFilter, preFilteredRows }
}) {
  const count = preFilteredRows.length;

  return (
    <input
      value={filterValue || ''}
      onChange={e => {
        setFilter(e.target.value || undefined);
      }}
      placeholder={`Search ${count} records...`}
      className="form-control form-control-sm"
    />
  );
}

function ViewerTable({ columns, data }) {
  const {
    getTableProps,
    getTableBodyProps,
    headerGroups,
    rows,
    prepareRow,
  } = useTable(
    {
      columns,
      data,
    },
    useFilters,
    useSortBy
  );

  return (
    <div className={styles.tableContainer}>
      <table {...getTableProps()} className={`table table-striped ${styles.smallFontTable}`}>
        <thead>
          {headerGroups.map(headerGroup => (
            <tr {...headerGroup.getHeaderGroupProps()}>
              {headerGroup.headers.map(column => (
                <th {...column.getHeaderProps()}>
                  <div className={styles.header}>
                    <div className={styles.headerTextContainer}>
                      <span className={styles.headerText} title={column.render('Header')}>
                        {column.render('Header')}
                      </span>
                    </div>
                    <span {...column.getSortByToggleProps()} className={styles.headerIcon}>
                      {column.isSorted
                        ? column.isSortedDesc
                          ? <FaSortDown />
                          : <FaSortUp />
                        : <FaSort />}
                    </span>
                  </div>
                  <div>{column.canFilter ? column.render('Filter') : null}</div>
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody {...getTableBodyProps()}>
          {rows.map(row => {
            prepareRow(row);
            return (
              <tr {...row.getRowProps()}>
                {row.cells.map(cell => (
                  <td {...cell.getCellProps()} title={String(cell.value)}>
                    {cell.render('Cell')}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function Viewer() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const result = await fetchViewerData();
        setData(result);
      } catch (error) {
        console.error("Fetching data failed:", error);
        setError(error.message);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const columns = useMemo(() => {
    if (data.length === 0) return [];
    return Object.keys(data[0]).map(key => ({
      Header: key,
      accessor: key,
      Filter: DefaultColumnFilter,
    }));
  }, [data]);

  return (
    <div className={styles.container}>
      {loading && <p>Loading data...</p>}
      {error && <p>Error: {error}</p>}
      {!loading && !error && data.length === 0 && <p>No data available</p>}
      {!loading && !error && data.length > 0 && (
        <ViewerTable columns={columns} data={data} />
      )}
    </div>
  );
}