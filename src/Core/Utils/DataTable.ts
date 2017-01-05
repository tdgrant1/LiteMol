/*
 * Copyright (c) 2016 David Sehnal, licensed under Apache 2.0, See LICENSE file for more info.
 */

namespace LiteMol.Core.Utils {
    "use strict";

    export type DataTable<Schema> = DataTable.Base<Schema> & DataTable.Columns<Schema>

    export module DataTable { 
        export type Columns<Schema> = { [P in keyof Schema]: Schema[P][]; }

        export interface ColumnDescriptor<Schema> {
            name: keyof Schema, 
            creator: (size: number) => any
        }

        export interface Base<Schema> {
            count: number,
            indices: number[],
            columns: ColumnDescriptor<Schema>[],
            getBuilder(count: number): Builder<Schema>,
            getRawData(): any[][],
            /**
             * Get a MUTABLE representation of a row.
             * Calling getRow() with differnt 'i' will change update old reference.
             */
            getRow(i: number): Schema
        }

        export interface Builder<Schema> {
            count: number,
            columns: ColumnDescriptor<Schema>[],
            addColumn<T>(name: keyof Schema, creator: (size: number) => T): T,
            getRawData(): any[][],

            /**
             * This functions clones the table and defines all its column inside the constructor, hopefully making the JS engine 
             * use internal class instead of dictionary representation.
             */
            seal(): DataTable<Schema>
        }

        export function builder<Schema>(count: number): Builder<Schema> {
            return new BuilderImpl(count);
        }

        class Row  {
            constructor(table: Base<any>, indexer: { index: number }) {
                for (let _c of table.columns) {
                    (function(c: ColumnDescriptor<any>, row: Row, idx: { index: number }, data: any[]) {                        
                        Object.defineProperty(row, c.name, { enumerable: true, configurable: false, get: function() { return data[idx.index] } });
                    })(_c, this, indexer, (table as any)[_c.name]);
                }
            }
        }

        class TableImpl implements Base<any> {
            private __row: Row;
            private __rowIndexer: { index: number } = { index: 0 };

            count: number;

            /*
            * Indices <0 .. count - 1>
            */
            indices: number[];
            columns: ColumnDescriptor<any>[];
            
            getBuilder(count: number): Builder<any> {
                let b = new BuilderImpl(count);
                for (let c of this.columns) {
                    b.addColumn(c.name, c.creator);
                }
                return b;
            }

            getRawData(): any[][] {
                return this.columns.map(c => (<any>this)[c.name]);
            }

            getRow(i: number): any {
                this.__rowIndexer.index = i;
                return this.__row;
            }

            constructor(count: number, srcColumns: ColumnDescriptor<any>[], srcData: { [name: string]: any }) {
                this.count = count;
                this.indices = <any>new Int32Array(count);
                this.columns = [];

                for (let i = 0; i < count; i++) {
                    this.indices[i] = i;
                }

                for (let col of srcColumns) {

                    let data = srcData[col.name];
                    if (Utils.ChunkedArray.is(data)) {
                        data = Utils.ChunkedArray.compact(data);
                    }
                    Object.defineProperty(this, col.name, { enumerable: true, configurable: false, writable: false, value: data });
                    this.columns[this.columns.length] = col;
                }

                this.__row = new Row(this, this.__rowIndexer);
            }
        }

        class BuilderImpl implements Builder<any> {
            count: number;

            columns: ColumnDescriptor<any>[] = [];

            addColumn<T>(name: string, creator: (size: number) => T): T {
                let c = creator(this.count);
                Object.defineProperty(this, name, { enumerable: true, configurable: false, writable: false, value: c });
                this.columns[this.columns.length] = { name, creator };
                return c;
            }

            getRawData(): any[][] {
                return this.columns.map(c => (<any>this)[c.name]);
            }

            /**
             * This functions clones the table and defines all its column inside the constructor, hopefully making the JS engine 
             * use internal class instead of dictionary representation.
             */
            seal<Schema>(): DataTable<Schema> {
                return new TableImpl(this.count, this.columns, this) as any;
            }

            constructor(count: number) {
                this.count = count;
            }
        }
    }
}